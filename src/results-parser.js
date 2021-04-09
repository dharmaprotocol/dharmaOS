const ethers = require("ethers");
const { Validator } = require("./validator");

class ResultsParser {
    static async parse({
        actionScript,
        calls,
        callResults,
        callABIs,
        resultToParse,
        contract,
        variables,
        isAdvanced,
    }) {
        const resultsParser = new ResultsParser({
            actionScript,
            calls,
            callResults,
            callABIs,
            resultToParse,
            contract,
            variables,
            isAdvanced,
        });

        return resultsParser.parse();
    }

    constructor(args) {
        const {
            actionScript,
            calls,
            callResults,
            callABIs,
            resultToParse,
            contract,
            variables,
            isAdvanced,
        } = args;

        this.actionScript = actionScript;
        this.calls = calls;
        this.callResults = callResults;
        this.callABIs = callABIs;
        this.resultToParse = resultToParse;
        this.contract = contract;
        this.variables = variables;
        this.isAdvanced = (
            typeof isAdvanced === "boolean"
                ? isAdvanced
                : Validator.isAdvanced(actionScript)
        );
    }

    async parse() {
        let success;
        let rawResults;
        if (!this.isAdvanced) {
            const { ok, returnData } = this.callResults;

            success = ok.every((x) => x);
            rawResults = this.calls.map((x, i) => [x, ok[i], returnData[i]]);
        } else {
            // parse based on AdvancedCallResults[]
            const ok = this.callResults.map(callResult => callResult.ok);
            const returnData = this.callResults.map(callResult => callResult.returnData);

            success = ok.every((x) => x);
            rawResults = this.calls.map((x, i) => [x, ok[i], returnData[i]]);
        }

        const results = await Promise.all(
            rawResults.map(async (x, i) => this.parseCall(x, this.callABIs[i]))
        );

        let parsedResults = {};

        let breakIndex = results.length;
        for (let [i, result] of Object.entries(results)) {
            if (!result.success) {
                this.revertReason = result.revertReason;

                breakIndex = i;

                break;
            }
        }

        for (let [callIndex, callTarget] of Object.entries(
            this.resultToParse
        )) {
            if (callIndex >= breakIndex) {
                break;
            }

            for (let [resultIndex, resultName] of Object.entries(callTarget)) {
                const rawParsedResult =
                    results[callIndex].orderedResults[resultIndex];
                const parsedResult = ethers.BigNumber.isBigNumber(
                    rawParsedResult
                )
                    ? rawParsedResult.toString()
                    : rawParsedResult;
                parsedResults[resultName] = parsedResult;
            }
        }

        // run operations
        const operations = this.actionScript.operations || [];

        for (let operation of operations) {
            const [input, output] = operation.split(" => ");

            const context = {
                ...this.variables,
                ...parsedResults,
            };

            // Skip operation if result already exists
            if (!(output in parsedResults)) {
                parsedResults[output] = this.evaluateOperation(input, context);
            }
        }

        const finalResults = {};
        const expectedResults = this.actionScript.results || {};
        for (let expectedResult of Object.keys(expectedResults)) {
            if (expectedResult in parsedResults) {
                finalResults[expectedResult] = parsedResults[expectedResult];
            }
        }

        return {
            success,
            parsedReturnData: results,
            results: finalResults,
            revertReason: this.revertReason,
        };
    }

    parseInputParameters(functionABI, functionName, data) {
        const contractInterface = new ethers.utils.Interface([functionABI]);

        const sighash = contractInterface.getSighash(functionName);

        const decoded = contractInterface.decodeFunctionData(
            functionName,
            `${sighash}${data}`
        );

        return [
            decoded,
            Object.entries(functionABI).map(([i, x]) => [
                x.name ? x.name : x.type,
                ethers.BigNumber.isBigNumber(decoded[i])
                    ? decoded[i].toString()
                    : decoded[i],
            ]).reduce(
                (result, [key, value]) => Object.assign({}, result, {[key]: value}),
                {}
            ),
        ];
    }

    parseOutputParameters(functionABI, functionName, data) {
        const contractInterface = new ethers.utils.Interface([functionABI]);

        const decoded = contractInterface.decodeFunctionResult(
            functionName,
            data
        );

        return [
            decoded,
            Object.entries(functionABI).map(([i, x]) => [
                x.name ? x.name : x.type,
                ethers.BigNumber.isBigNumber(decoded[i])
                    ? decoded[i].toString()
                    : decoded[i],
            ]).reduce(
                (result, [key, value]) => Object.assign({}, result, {[key]: value}),
                {}
            ),
        ];
    }

    parseRevertReason(hexString) {
        return hexString &&
            hexString.startsWith(`0x08c379a${"".padStart(63, "0")}20`) &&
            hexString.length >= 202
            ? ethers.utils.toUtf8String(
                  "0x" +
                      hexString.slice(
                          138,
                          138 +
                              2 *
                                  ethers.BigNumber.from(
                                      "0x" + hexString.slice(74, 138)
                                  ).toNumber()
                      )
              )
            : "(no revert reason)";
    }

    evaluateOperation(code, context) {
        const [a, operator, b] = code.split(" ");

        try {
            const safeA = ethers.BigNumber.from(a in context ? context[a] : a);
            const safeB = ethers.BigNumber.from(b in context ? context[b] : b);

            let result;

            if (operator === "+") {
                result = safeA.add(safeB);
            } else if (operator === "-") {
                result = safeA.sub(safeB);
            } else if (operator === "/") {
                result = safeA.div(safeB);
            } else if (operator === "*") {
                result = safeA.mul(safeB);
            } else if (operator === "**") {
                result = safeA.pow(safeB);
            } else {
                throw new Error("Unknown operator");
            }

            if (result.toString() === "NaN") {
                return null;
            }
            return result.toString();
        } catch (error) {
            return null;
        }
    }

    async parseCall(rawResult, callABI = null) {
        const [call, ok, returnData] = rawResult;

        const hasData = !!call.data && call.data !== "0x";
        const hasOutput = !!returnData && returnData !== "0x";

        let value = call.value;

        const selector =
            hasData && call.data.length >= 10 ? call.data.slice(0, 10) : null;
        const rawInput = selector ? call.data.slice(10) : null;

        let functionName,
            parsedInput,
            parsedOutput,
            revertReason,
            orderedResults;
        functionName = parsedInput = parsedOutput = revertReason = orderedResults = null;

        let target;
        let functionABI = callABI;

        if (functionABI) {
            functionName = functionABI.name;

            if (rawInput) {
                [, parsedInput] = this.parseInputParameters(
                    functionABI,
                    functionName,
                    rawInput
                );
            }
            if (ok) {
                if (hasOutput) {
                    [orderedResults, parsedOutput] = this.parseOutputParameters(
                        functionABI,
                        functionName,
                        returnData
                    );
                }
            } else {
                revertReason = this.parseRevertReason(returnData);
            }
        }

        return {
            target:
                target && target.name
                    ? `${target.name} —> ${call.to}`
                    : call.to,
            value,
            targetFunction: functionName,
            arguments: parsedInput,
            success: ok,
            returnValues: parsedOutput,
            revertReason,
            orderedResults,
        };
    }
}

module.exports = {
    ResultsParser,
};

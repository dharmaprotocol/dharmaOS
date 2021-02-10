const hre = require("hardhat");
const ethers = hre.ethers;

class ResultsParser {

    constructor(args) {
        const {
            actionScriptName,
            calls,
            callResults,
            callABIs,
            resultToParse,
            contract,
        } = args;

        this.actionScriptName= actionScriptName;
        this.calls = calls;
        this.callResults = callResults;
        this.callABIs = callABIs;
        this.resultToParse = resultToParse;
        this.contract = contract;

    }

    async parse() {
        const { ok, returnData } = this.callResults;

        const success = ok.every(x => x);
        const rawResults = this.calls.map((x, i) => [x, ok[i], returnData[i]]);

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
                parsedResults[resultName] =
                    results[callIndex].orderedResults[resultIndex];
            }
        }

        this.script = await Validator.getActionScript(this.actionScriptName);


        // run operations
        // const operations = this.script.operations || [];
        //
        // for (let operation of operations) {
        //     const [input, output] = operation.split(" => ");
        //
        //     const context = {
        //         ...this.variables,
        //         ...results,
        //     };
        //
        //     results[output] = this.evaluateOperation(input, context);
        // }

        return {
            success,
            results: parsedResults
        };
    }

    parseInputParameters(functionABI, selector, data) {
        console.log("parseInputParameters");

        console.log({functionABI, selector, data});

        const contractInterface = new ethers.utils.Interface([functionABI]);

        console.log({contractInterface});

        const decoded = contractInterface.decodeFunctionData(selector, data);

        console.log({decoded});

        return [
            decoded,
            Object.fromEntries(
                Object.entries(functionABI).map(([i, x]) => [
                    x.name ? x.name : x.type,
                    decoded[i],
                ])
            ),
        ];
    }

    parseOutputParameters(functionABI, selector, data) {
        console.log("parseOutputParameters");
        console.log({functionABI, selector, data});

        const contractInterface = new ethers.utils.Interface([functionABI]);

        console.log({contractInterface});

        const decoded = contractInterface.decodeFunctionResults(selector, data);

        console.log({decoded});

        return [
            decoded,
            Object.fromEntries(
                Object.entries(functionABI).map(([i, x]) => [
                    x.name ? x.name : x.type,
                    decoded[i],
                ])
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
                    ethers.utils.BigNumber.from(
                        "0x" + hexString.slice(74, 138)
                    ).toNumber()
                )
            )
            : "(no revert reason)";
    }


    async parseCall(rawResult, callABI = null) {
        const [call, ok, returnData] = rawResult;

        const hasData = !!call.data && call.data !== "0x";
        const hasOutput = !!returnData && returnData !== "0x";

        let value = call.value;

        const selector =
            hasData && call.data.length >= 10 ? call.data.slice(0, 10) : null;
        const rawInput = selector ? `0x${call.data.slice(10)}` : null;

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
                    selector,
                    rawInput
                );
            }
            if (ok) {
                if (hasOutput) {
                    [orderedResults, parsedOutput] = this.parseOutputParameters(
                        functionABI,
                        selector,
                        `0x${returnData}`
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
    ResultsParser
};

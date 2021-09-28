const { Validator } = require("./validator");
const ethers = require("ethers");

ethers.utils.Logger.setLogLevel(ethers.utils.Logger.levels.ERROR);

const ERC20_ABI = [
    {
        constant: true,
        inputs: [],
        name: "name",
        outputs: [
            {
                name: "",
                type: "string",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: false,
        inputs: [
            {
                name: "_spender",
                type: "address",
            },
            {
                name: "_value",
                type: "uint256",
            },
        ],
        name: "approve",
        outputs: [
            {
                name: "",
                type: "bool",
            },
        ],
        payable: false,
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        constant: true,
        inputs: [],
        name: "totalSupply",
        outputs: [
            {
                name: "",
                type: "uint256",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: false,
        inputs: [
            {
                name: "_from",
                type: "address",
            },
            {
                name: "_to",
                type: "address",
            },
            {
                name: "_value",
                type: "uint256",
            },
        ],
        name: "transferFrom",
        outputs: [
            {
                name: "",
                type: "bool",
            },
        ],
        payable: false,
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        constant: true,
        inputs: [],
        name: "decimals",
        outputs: [
            {
                name: "",
                type: "uint8",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: true,
        inputs: [
            {
                name: "_owner",
                type: "address",
            },
        ],
        name: "balanceOf",
        outputs: [
            {
                name: "balance",
                type: "uint256",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: true,
        inputs: [],
        name: "symbol",
        outputs: [
            {
                name: "",
                type: "string",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: false,
        inputs: [
            {
                name: "_to",
                type: "address",
            },
            {
                name: "_value",
                type: "uint256",
            },
        ],
        name: "transfer",
        outputs: [
            {
                name: "",
                type: "bool",
            },
        ],
        payable: false,
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        constant: true,
        inputs: [
            {
                name: "_owner",
                type: "address",
            },
            {
                name: "_spender",
                type: "address",
            },
        ],
        name: "allowance",
        outputs: [
            {
                name: "",
                type: "uint256",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        payable: true,
        stateMutability: "payable",
        type: "fallback",
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: "owner",
                type: "address",
            },
            {
                indexed: true,
                name: "spender",
                type: "address",
            },
            {
                indexed: false,
                name: "value",
                type: "uint256",
            },
        ],
        name: "Approval",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: "from",
                type: "address",
            },
            {
                indexed: true,
                name: "to",
                type: "address",
            },
            {
                indexed: false,
                name: "value",
                type: "uint256",
            },
        ],
        name: "Transfer",
        type: "event",
    },
];

const ETHER_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const ERC20_CALL_ARGUMENTS = [
    ['transfer', ['address', 'uint256']],
    ['transferFrom', ['address', 'address', 'uint256']],
    ['approve', ['address', 'uint256']],
    ['allowance', ['address', 'address']],
    ['balanceOf', ['address']],
    ['totalSupply', []]
].map(([functionName, functionArguments]) => [
    functionName,
    functionArguments.map((type, i) => ({
        type,
        size: 32,
        offset: 4 + 32 * i
    }))
]).reduce(
    (result, [key, value]) => Object.assign({}, result, {[key]: value}),
    {}
);

const ERC20_CALL_RESULTS = [
    'transfer',
    'transferFrom',
    'approve',
    'allowance',
    'balanceOf',
    'totalSupply'
].map(functionName => [
    functionName,
    [{
        type: functionName.includes('l') ? 'uint256' : 'bool',
        size: 32,
        offset: 0
    }]
]).reduce(
    (result, [key, value]) => Object.assign({}, result, {[key]: value}),
    {}
);

class Encoder {
    static encode({actionScript, variables, wallet}) {
        const encoder = new Encoder(actionScript, variables, wallet);

        return encoder.encode();
    }

    constructor(actionScript, variables, wallet, isAdvanced = null) {
        this.actionScript = actionScript;
        this.variables = variables;
        this.variables["wallet"] = wallet;
        this.isAdvanced = (
            isAdvanced === null
                ? Validator.isAdvanced(actionScript)
                : !!isAdvanced
        );
        this.knownCallResultVariables = {};
    }

    encode() {
        this.parseActionScriptDefinitions();
        this.constructCallsAndResultsFormat();

        return {
            calls: this.calls,
            callABIs: this.callABIs,
            resultToParse: this.resultToParse,
            isAdvanced: this.isAdvanced,
        };
    }

    static encodeSequence({sequence, variables, wallet}) {
        const isAdvanced = sequence.some(({ actionScript, resultsToApply }) => (
            !!resultsToApply && resultsToApply.length > 0 ||
            Validator.isAdvanced(actionScript)
        ));

        let sequenceCallIndex = 0;
        const encoded = [];
        const sequenceKnownCallResultVariables = [];
        const sequenceCallIndices = [];
        let calls = [];
        for (const { actionScript, resultsToApply } of sequence) {
            const encoder = new Encoder(
                actionScript, variables, wallet, isAdvanced
            );

            encoder.parseActionScriptDefinitions();
            encoder.callIndex = sequenceCallIndex;
            encoder.calls = calls;
            sequenceCallIndices.push(sequenceCallIndex);

            for (const { sequenceIndex, result, variable } of resultsToApply) {
                const resultToApply = sequenceKnownCallResultVariables[sequenceIndex][result];
                encoder.knownCallResultVariables[variable] = resultToApply;
            }

            encoded.push(encoder.encode());
            calls = encoder.calls;
            sequenceCallIndex = encoder.callIndex;
            sequenceKnownCallResultVariables.push(encoder.knownCallResultVariables);
        }

        const callABIs = [].concat(...encoded.map(x => x.callABIs));
        const resultToParse = encoded
            .map(x => x.resultToParse)
            .reduce((result, obj) => Object.assign({}, result, obj), {});

        return {
            calls,
            callABIs,
            resultToParse,
            isAdvanced,
            sequenceCallIndices,
        };
    }

    static typeSizes(type) {
        if (typeof type !== "string") {
            throw new Error("Types must be formatted as strings.");
        }

        if (type === "string" || type === "bytes") {
            throw new Error("Cannot infer size of dynamically-sized types.");
        }

        if (type.includes("[")) {
            throw new Error("Typed array size cannot be inferred from type alone.");
        }

        if (type.includes("(")) {
            throw new Error("Struct types are not yet supported.");
        }

        return 32;
    }

    deriveTypedArrayElementTotals() {
        const { definitions } = this.actionScript;

        // find the argument index of all typed arrays for each defined function
        const typedArrayIndicesByFunction = definitions
            .filter(definition => definition.startsWith("Function "))
            .map(definition => {
                const functionName = definition.split(' ')[1].split(':')[0];
                const callArgumentTypes = Encoder.parseCallArgumentTypes(definition);
                const typedArrayArgumentsByIndex = callArgumentTypes
                    .map((e, i) => e.endsWith('[]') ? i : null)
                    .filter(e => e !== null);

                const callReturnTypes = Encoder.parseCallReturnTypes(definition);
                const typedArrayReturnsByIndex = callReturnTypes
                    .map((e, i) => e.endsWith('[]') ? i : null)
                    .filter(e => e !== null);

                return [
                    functionName,
                    {
                        typedArrayArgumentsByIndex,
                        typedArrayReturnsByIndex,
                    }
                ];
            }).reduce(
                (result, [key, value]) => Object.assign({}, result, {[key]: value}),
                {}
            );

        this.typedArrayElementTotals = this.actions
            .filter(action => (
                action.split(' ')[1].split(':')[0] in typedArrayIndicesByFunction
            )).map(action => {
                const argumentElementTotals = {};
                const returnElementTotals = {};

                const functionName = action.split(' ')[1].split(':')[0];

                let givenArgumentsString = action.split(" => ")[0].split(" ").slice(2).join(" ");

                let givenArguments = [];

                while (givenArgumentsString) {
                    if (givenArgumentsString.startsWith("(")) {
                        givenArguments.push(
                            givenArgumentsString.slice(
                                1,
                                givenArgumentsString.indexOf(")")
                            ).split(" ")
                        );

                        givenArgumentsString = givenArgumentsString
                            .slice(givenArgumentsString.indexOf(")") + 1)
                            .trim();
                    } else if (givenArgumentsString.indexOf(" ") !== -1) {
                        givenArguments.push(
                            givenArgumentsString.slice(
                                0,
                                givenArgumentsString.indexOf(" ")
                            )
                        );
                        givenArgumentsString = givenArgumentsString
                            .slice(givenArgumentsString.indexOf(" ") + 1);
                    } else {
                        givenArguments.push(givenArgumentsString);
                        break;
                    }
                }

                const argumentValues = givenArguments
                    .filter(x => x)
                    .map(x => typeof x === "string" ? x.trim(" ") : x);

                const returnValues = (action.split(' => ')[1] || '')
                    .split(' ')
                    .filter(x => x)
                    .map(x => typeof x === "string" ? x.trim(" ") : x);

                const {
                    typedArrayArgumentsByIndex,
                    typedArrayReturnsByIndex,
                } = typedArrayIndicesByFunction[functionName];

                for (const i of typedArrayArgumentsByIndex) {
                    const argumentValue = argumentValues[i];
                    // Note: nested arrays are not yet supported.
                    if (typeof argumentValue === "string" && argumentValue.startsWith("[") && argumentValue.endsWith("]")) {
                        argumentElementTotals[i] = argumentValue.split(",").length;
                    }
                }

                for (const i of typedArrayReturnsByIndex) {
                    const returnValue = returnValues[i];
                    // Note: nested arrays are not yet supported.
                    if (typeof returnValue === "string" && returnValue.startsWith("[") && returnValue.endsWith("]")) {
                        returnElementTotals[i] = returnValue.split(",").length;
                    }
                }

                return [
                    functionName,
                    {
                        argumentElementTotals,
                        returnElementTotals,
                    }
                ];
            }).reduce(
                (result, [key, value]) => Object.assign({}, result, {[key]: value}),
                {}
            );
    }

    static typeZeroPaddings(type, knownSize = null) {
        if (typeof type !== "string") {
            throw new Error("Types must be formatted as strings.");
        }

        if (type === "string" || type === "bytes") {
            throw new Error("Cannot infer zero-padding of dynamically-sized types.");
        }

        if (type.includes("[")) {
            if (knownSize === null) {
                throw new Error(
                    "Typed array types without a known size are not supported."
                );
            }
            const [typedArrayType, rest] = type.split("[");
            if (rest !== "]") {
                throw new Error(
                    "Nested typed array types are not yet supported."
                );
            }
            return Array(knownSize).fill(Encoder.typeZeroPaddings(typedArrayType));
        }

        if (type.includes("(")) {
            throw new Error("Struct types are not yet supported.");
        }

        if (type === "bool") {
            return false;
        }

        if (type === "address") {
            return "0x0000000000000000000000000000000000000000";
        }

        if (type.startsWith("uint")) {
            return 0;
        }

        // Note: look into actual encoding and ensure that this is correct
        if (type.startsWith("int")) {
            return 0;
        }

        if (type.startsWith("bytes")) {
            return "0x0";
        }

        throw new Error(`Zero-padding for type "${type}" not yet implemented!`);
    }

    determineConditionalActions(action) {
        if (!(typeof action === 'object' && 'if' in action)) {
            throw new Error("Attempting to branch on a non-conditional action.");
        }

        const splitCondition = action.if.condition.split(" ");
        const conditionalVariable = splitCondition[0];
        const comparisonVariable = splitCondition[2];

        let conditionTrue;

        if (comparisonVariable === 'true') {
            conditionTrue = !!this.variables[conditionalVariable];
        } else if (comparisonVariable === 'false') {
            conditionTrue = !this.variables[conditionalVariable];
        } else {
            const tokenToReplaceAddress = this.contracts[conditionalVariable].address;

            conditionTrue = (
                comparisonVariable === 'ETHER' &&
                tokenToReplaceAddress === ETHER_ADDRESS
            ) || (
                tokenToReplaceAddress === (
                    this.contracts[comparisonVariable] &&
                    this.contracts[comparisonVariable].address
                )
            );
        }

        return action.if[conditionTrue ? 'then' : 'else'] || [];
    }

    flatten(actions) {
        const flatActions = [];
        for (const action of actions) {
            if (typeof action === 'object' && 'if' in action) {
                const conditionalActions = this.determineConditionalActions(action);
                flatActions.push(...this.flatten(conditionalActions));
            } else {
                flatActions.push(action);
            }
        }
        return flatActions;
    }

    constructCallAndResultFormat(action) {
        if (typeof action === 'object' && 'raw' in action) {
            const { to: toVariable, value: valueVariable, data: dataVariable } = action.raw;

            const to = this.variables[toVariable];
            const value = this.variables[valueVariable];
            const data = this.variables[dataVariable];

            this.calls.push({
                to,
                value,
                data,
            });
        } else {
            const appliedArgs = [];

            // parse calls and results
            const splitActionCalls = action.split(" => ")[0];
            const splitActionResults = (action.split(" => ")[1] || "")
                .split(" ")
                .filter(x => x);

            let givenArgumentsString = splitActionCalls.split(" ").slice(2).join(" ");

            let givenArguments = [];

            while (givenArgumentsString) {
                if (givenArgumentsString.startsWith("(")) {
                    givenArguments.push(
                        givenArgumentsString.slice(
                            1,
                            givenArgumentsString.indexOf(")")
                        ).split(" ")
                    );

                    givenArgumentsString = givenArgumentsString
                        .slice(givenArgumentsString.indexOf(")") + 1)
                        .trim();
                } else if (givenArgumentsString.indexOf(" ") !== -1) {
                    givenArguments.push(
                        givenArgumentsString.slice(
                            0,
                            givenArgumentsString.indexOf(" ")
                        )
                    );
                    givenArgumentsString = givenArgumentsString
                        .slice(givenArgumentsString.indexOf(" ") + 1);
                } else {
                    givenArguments.push(givenArgumentsString);
                    break;
                }
            }

            let args = givenArguments
                .filter(x => x)
                .map(x => typeof x === "string" ? x.trim(" ") : x);

            let [contractName, functionName] = splitActionCalls.split(
                " "
            );

            if (contractName === "ETHER") {
                args = functionName.split(":");
            }

            let payableArg = 0;
            let appliedPayableArg = 0;
            if (functionName.includes(":")) {
                payableArg = functionName.split(":")[1];
                functionName = functionName.split(":")[0];

                if (payableArg in this.variables) {
                    appliedPayableArg = this.variables[payableArg];
                } else if (payableArg in this.targetContracts) {
                    appliedPayableArg = this.targetContracts[payableArg]
                        .address;
                } else if (!!this.isAdvanced && payableArg in this.knownCallResultVariables) {
                    const {
                        callIndex,
                        returndata,
                    } = this.knownCallResultVariables[payableArg];

                    // TODO: check returndata type + size and ensure it's valid

                    this.calls[callIndex].replaceValue.push({
                        returnDataOffset: returndata.offset,
                        valueLength: returndata.size,
                        callIndex: this.callIndex,
                    });

                    appliedPayableArg = 0;
                } else {
                    appliedPayableArg = payableArg;
                }
            }

            for (let [argIndex, arg] of Object.entries(args)) {
                // handle structs (TODO: no support for advanced call insertion)
                if (Array.isArray(arg)) {
                    const subArgs = [];
                    for (let subArg of arg) {
                        if (subArg in this.variables) {
                            subArgs.push(this.variables[subArg]);
                        } else if (subArg in this.targetContracts) {
                            subArgs.push(this.targetContracts[subArg].address);
                        } else {
                            subArgs.push(subArg);
                        }
                    }
                    appliedArgs.push(subArgs);
                } else if (arg in this.variables) {
                    const appliedArg = this.variables[arg];
                    appliedArgs.push(appliedArg);
                } else if (arg in this.targetContracts) {
                    appliedArgs.push(this.targetContracts[arg].address);
                } else if (!!this.isAdvanced && arg in this.knownCallResultVariables) {
                    const {
                        callIndex,
                        returndata,
                    } = this.knownCallResultVariables[arg];

                    const calldata = this.callArgumentsByFunction[functionName][argIndex];

                    if (calldata.type !== returndata.type) {
                        throw new Error(
                            `arg "${
                                arg
                            }" calldata type "${
                                calldata.type
                            }" does not match returndata type "${
                                returndata.type
                            }"`
                        );
                    }

                    if (calldata.size === null || calldata.offset === null) {
                        if (this.error) {
                            const error = this.error;
                            throw error;
                        } else {
                            throw new Error(
                                `arg "${arg}" calldata could not be derived`
                            );
                        }
                    }

                    if (calldata.size !== returndata.size) {
                        throw new Error(
                            `arg "${
                                arg
                            }" calldata size "${
                                calldata.size
                            }" does not match returndata size "${
                                returndata.size
                            }"`
                        );
                    }

                    this.calls[callIndex].replaceData.push({
                        returnDataOffset: returndata.offset,
                        dataLength: returndata.size,
                        callIndex: this.callIndex,
                        callDataOffset: calldata.offset,
                    });

                    appliedArgs.push(Encoder.typeZeroPaddings(returndata.type));
                } else if (!!arg && typeof arg === "string" && arg.startsWith("[") && arg.endsWith("]")) {
                    const arrayArgs = arg
                        .slice(1, -1)
                        .split(',')
                        .map(arrayArg => {
                            if (arrayArg in this.variables) {
                                return this.variables[arrayArg];
                            } else if (arrayArg in this.targetContracts) {
                                return this.targetContracts[arrayArg].address;
                            } else {
                                return arrayArg;
                            }
                        });

                    appliedArgs.push(arrayArgs);
                } else {
                    appliedArgs.push(arg);
                }
            }

            let targetFunction = this.targetFunctions[functionName];

            if (!!targetFunction && targetFunction.includes(":")) {
                targetFunction = targetFunction.split(":")[0];
            }

            if (contractName === "ETHER") {
                if (!this.isAdvanced) {
                    this.calls.push({
                        to: appliedArgs[0],
                        value: appliedArgs[1],
                        data: "0x",
                    });
                } else {
                    this.calls.push({
                        to: appliedArgs[0],
                        value: appliedArgs[1],
                        data: "0x",
                        replaceValue: [],
                        replaceData: [],
                    });
                }

                this.callABIs.push({
                    payable: true,
                    stateMutability: "payable",
                    type: "fallback",
                });
            } else if (targetFunction === "fallback") {
                const contract = this.contracts[contractName];
                const to = contract.address;

                if (!this.isAdvanced) {
                    this.calls.push({
                        to,
                        value: appliedPayableArg,
                        data: "0x",
                    });
                } else {
                    this.calls.push({
                        to,
                        value: appliedPayableArg,
                        data: "0x",
                        replaceValue: [],
                        replaceData: [],
                    });
                }

                this.callABIs.push({
                    payable: true,
                    stateMutability: "payable",
                    type: "fallback",
                });
            } else {
                const contract = this.contracts[contractName];

                const to = contract.address;
                const data = contract.interface.encodeFunctionData(
                    targetFunction,
                    appliedArgs
                );

                if (!this.isAdvanced) {
                    this.calls.push({
                        to,
                        value: appliedPayableArg,
                        data,
                    });
                } else {
                    this.calls.push({
                        to,
                        value: appliedPayableArg,
                        data,
                        replaceValue: [],
                        replaceData: [],
                    });
                }

                const callABIIndex = this.targetContracts[contractName].abi
                    .map((f) => f.name)
                    .indexOf(targetFunction);

                if (callABIIndex === -1) {
                    throw new Error("Could not find function ABI");
                }

                this.callABIs.push(
                    this.targetContracts[contractName].abi[callABIIndex]
                );

                this.resultToParse[this.callIndex] = {};

                // parse results
                for (let [resultIndex, result] of Object.entries(splitActionResults)) {
                    this.resultToParse[this.callIndex][resultIndex] = result;

                    if (!!this.isAdvanced) {
                        const callResult = this.callResultsByFunction[functionName][resultIndex];

                        if (
                            result.startsWith("[") &&
                            result.endsWith("]")
                        ) {
                            const subResults = result
                                .slice(1, -1)
                                .split(',');

                            const {
                                type: superType,
                                offset: superOffset
                            } = callResult;

                            const type = superType.replace("[]", "");
                            const size = Encoder.typeSizes(type);

                            for (const [subResultIndex, subResult] of Object.entries(subResults)) {
                                const returndata = {
                                    type,
                                    size,
                                    offset: superOffset + (subResultIndex * size),
                                };

                                this.knownCallResultVariables[subResult] = {
                                    callIndex: this.callIndex,
                                    returndata,
                                };
                            }

                        } else {
                            this.knownCallResultVariables[result] = {
                                callIndex: this.callIndex,
                                returndata: callResult,
                            };
                        }
                    }
                }
            }

            this.callIndex++;
        }
    }

    getSizesAndOffsetsFromTypes(functionName, types, includeSelector, catchError = false) {
        if (types.length === 0) {
            return [];
        }

        let elementTotals = {};

        if (functionName in this.typedArrayElementTotals) {
            const elementCategory = !!includeSelector
                ? 'argumentElementTotals'
                : 'returnElementTotals';

            elementTotals = this.typedArrayElementTotals[functionName][elementCategory];
        }

        let sizes;

        try {
            sizes = types.map(
                (type, i) => (
                    i in elementTotals
                        ? elementTotals[i] * Encoder.typeSizes('uint256') // TODO: use actual typed array element type
                        : Encoder.typeSizes(type)
                )
            );
        } catch (error) {
            if (catchError) {
                this.error = error;
                return types.map(type => ({
                    type,
                    size: null,
                    offset: null,
                }));
            }

            throw error;
        }

        const referenceEncoding = ethers.utils.defaultAbiCoder.encode(
            types,
            types.map((type, i) => Encoder.typeZeroPaddings(
                type,
                i in elementTotals
                    ? elementTotals[i]
                    : null
            ))
        );

        const referenceChunks = referenceEncoding
            .replace("0x", "")
            .slice(0, 64 * types.length)
            .match(/.{1,64}/g)
            .map(x => ethers.BigNumber.from(`0x${x}`).toNumber());

        const extraOffset = includeSelector ? 4 : 0;

        const offsets = Array(types.length).fill(32).map(
            (sum => value => sum += value)(-32 + extraOffset)
        );
        for (let i = 0; i < types.length; i++) {
            if (i in elementTotals) {
                offsets[i] = referenceChunks[i] + 32 + extraOffset;
            }
        }

        return types.map(
            (type, i) => ({
                type,
                size: sizes[i],
                offset: offsets[i],
            })
        );
    }

    // TODO: support tuples (needed for advanced calls)
    static parseCallArgumentTypes(definition) {
        return definition.split(' ')[3] === 'fallback'
            ? []
            : definition
                .split(" => ")[0]
                .replace(":payable", "")
                .split("(")[1]
                .slice(0, -1)
                .split(",")
                .filter(x => x)
                .map(x => typeof x === "string" ? x.trim(" ") : x);
    }

    static parseCallReturnTypes(definition) {
        return (definition.split(' => ')[1] || '')
            .split(' ')
            .filter(x => x);
    }

    constructCallsAndResultsFormat() {
        this.calls = this.calls || [];
        this.callABIs = [];
        this.resultToParse = {};

        const { actions, definitions } = this.actionScript;

        this.actions = this.flatten(actions);

        this.callArgumentsByFunction = {};
        this.callResultsByFunction = {};

        if (!!this.isAdvanced) {
            const functionDefinitions = new Set(
                this.actions.map(action => action.split(' ')[1].split(':')[0])
            );

            const relevantDefinitions = definitions.filter(definition => (
                definition.startsWith("Function ") &&
                functionDefinitions.has(definition.split(' ')[1].split(':')[0])
            ));

            this.deriveTypedArrayElementTotals();

            const definitionCallArguments = relevantDefinitions
                .map(definition => {
                    const functionName = definition.split(' ')[1].split(':')[0];
                    const callArgumentTypes = Encoder.parseCallArgumentTypes(definition);

                    return [
                        functionName,
                        this.getSizesAndOffsetsFromTypes(
                            functionName,
                            callArgumentTypes,
                            true,
                            true
                        )
                    ];
                }).reduce(
                    (result, [key, value]) => Object.assign({}, result, {[key]: value}),
                    {}
                );

            this.callArgumentsByFunction = {
                ...definitionCallArguments,
                ...ERC20_CALL_ARGUMENTS
            };

            const definitionCallResults = relevantDefinitions
                .map(definition => {
                    const functionName = definition.split(' ')[1].split(':')[0];
                    const callReturnTypes = Encoder.parseCallReturnTypes(definition);

                    return [
                        functionName,
                        this.getSizesAndOffsetsFromTypes(
                            functionName,
                            callReturnTypes,
                            false
                        )
                    ];
                }).reduce(
                    (result, [key, value]) => Object.assign({}, result, {[key]: value}),
                    {}
                );

            this.callResultsByFunction = {
                ...definitionCallResults,
                ...ERC20_CALL_RESULTS
            };
        }

        this.callIndex = this.callIndex || 0;
        for (let action of this.actions) {
            this.constructCallAndResultFormat(action);
        }
    }

    parseActionScriptDefinitions() {
        const definitions = this.actionScript.definitions || [];

        this.targetContracts = {};
        this.targetFunctions = {
            transfer: "transfer",
            transferFrom: "transferFrom",
            balanceOf: "balanceOf",
            approve: "approve",
            totalSupply: "totalSupply",
            allowance: "allowance",
        };

        for (let definition of definitions) {
            const splitDefinition = definition.split(" "); // Contract | Token | Function | Action

            const splitDefinitionByOutputs = definition.split(" => ");

            const outputDefinitions =
                splitDefinitionByOutputs.length > 1
                    ? splitDefinitionByOutputs[1].split(" ")
                    : [];
            const type = splitDefinition[0];

            let name;
            let address;
            let functionName;
            let contractName;
            let candidateAddress;

            switch (type) {
                case "Contract":
                    name = splitDefinition[1];

                    candidateAddress = splitDefinition[2];

                    if (candidateAddress in this.variables) {
                        // TODO validate 'address' type:
                        address = this.variables[candidateAddress];
                    } else {
                        address = candidateAddress;
                    }

                    this.targetContracts[name] = {
                        address,
                        abi: [],
                        namedFunctions: {},
                    };
                    break;
                case "Token":
                    name = splitDefinition[1];

                    candidateAddress = splitDefinition[2];

                    if (candidateAddress in this.variables) {
                        // TODO validate 'address' type:
                        address = this.variables[candidateAddress];
                    } else {
                        address = candidateAddress;
                    }

                    this.targetContracts[name] = {
                        address,
                        abi: ERC20_ABI.slice(),
                        namedFunctions: {},
                    };

                    break;
                case "Function":
                    functionName = splitDefinition[1];
                    contractName = splitDefinition[2];

                    let payable = false;

                    let functionSignature = splitDefinition[3];

                    if (functionSignature.endsWith(":payable")) {
                        payable = true;
                        functionSignature = functionSignature.slice(0, -8);
                    }

                    let functionABI = {};
                    let contractFunctionName;
                    if (functionSignature === "fallback") {
                        functionSignature = "()";
                        functionABI = {
                            payable,
                            stateMutability: payable ? "payable" : "nonpayable",
                            type: "fallback",
                        };
                        contractFunctionName = "fallback";
                    } else {
                        contractFunctionName = functionSignature.split("(")[0];

                        let functionDefinitionWithArguments =
                            splitDefinitionByOutputs[0];
                        if (
                            functionDefinitionWithArguments.endsWith(":payable")
                        ) {
                            functionDefinitionWithArguments = functionDefinitionWithArguments.slice(
                                0,
                                -8
                            );
                        }

                        const allContractFunctionArgumentString = functionDefinitionWithArguments
                            .slice(
                                functionDefinitionWithArguments.indexOf("(") + 1,
                                functionDefinitionWithArguments.lastIndexOf(")")
                            );

                        let contractFunctionArguments;
                        if (allContractFunctionArgumentString.length === 0) {
                            contractFunctionArguments = null;
                        } else if (!allContractFunctionArgumentString.includes("(")) {
                            contractFunctionArguments = allContractFunctionArgumentString.split(",");
                        } else {
                            // handle structs

                            let givenArgumentsString = allContractFunctionArgumentString;

                            let givenArguments = [];
                            while (givenArgumentsString) {
                                if (givenArgumentsString.startsWith(",")) {
                                    givenArgumentsString = givenArgumentsString.slice(1);
                                } else if (givenArgumentsString.startsWith("(")) {
                                    givenArguments.push(
                                        givenArgumentsString.slice(
                                            1,
                                            givenArgumentsString.indexOf(")")
                                        )
                                        .split(",")
                                        .map(x => typeof x === "string" ? x.trim() : x)
                                    );

                                    givenArgumentsString = givenArgumentsString
                                        .slice(givenArgumentsString.indexOf(")") + 1)
                                        .trim();
                                } else if (givenArgumentsString.indexOf(",") !== -1) {
                                    givenArguments.push(
                                        givenArgumentsString.slice(
                                            0,
                                            givenArgumentsString.indexOf(",")
                                        )
                                    );
                                    givenArgumentsString = givenArgumentsString
                                        .slice(givenArgumentsString.indexOf(",") + 1);
                                } else {
                                    givenArguments.push(givenArgumentsString);
                                    break;
                                }
                            }

                            contractFunctionArguments = givenArguments;
                        }

                        functionABI = {
                            constant: false,
                            name: contractFunctionName,
                            outputs: !!outputDefinitions
                                ? Object.entries(outputDefinitions).map(
                                      ([i, returnValue]) => ({
                                          name: `${contractFunctionName}ReturnValue${i}`,
                                          type: returnValue.trim(" "),
                                          internalType: returnValue.trim(" "),
                                      })
                                  )
                                : [],
                            payable,
                            stateMutability: payable ? "payable" : "nonpayable",
                            type: "function",
                            inputs: !!contractFunctionArguments
                                ? Object.entries(contractFunctionArguments).map(
                                    ([i, arg]) => {
                                        if (typeof arg === "string") {
                                            return ({
                                                name: `${contractFunctionName}Argument${i}`,
                                                type: arg.trim(" "),
                                                internalType: arg.trim(" "),
                                            })
                                        } else if (Array.isArray(arg)) {
                                            return ({
                                                name: `${contractFunctionName}Argument${i}`,
                                                type: "tuple",
                                                internalType: "tuple",
                                                components: Object.entries(arg).map(([j, subArg]) => ({
                                                    name: `${contractFunctionName}Argument${i}SubArg${j}`,
                                                    type: subArg.trim(" "),
                                                    internalType: subArg.trim(" "),
                                                })),
                                            });
                                        } else {
                                            throw new Error("Invalid input arg type");
                                        }
                                    }
                                  )
                                : [],
                        };
                    }

                    this.targetContracts[contractName].abi.push(functionABI);

                    this.targetFunctions[functionName] = contractFunctionName;

                    break;
                default:
                    break;
            }
        }

        this.contracts = Object.entries(this.targetContracts).map(
            ([name, value]) => {
                return [
                    name,
                    new ethers.Contract(
                        value.address,
                        value.abi,
                        ethers.provider
                    ),
                ];
            }
        ).reduce(
            (result, [key, value]) => Object.assign({}, result, {[key]: value}),
            {}
        );
    }
}

module.exports = {
    Encoder,
};

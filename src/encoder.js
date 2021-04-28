const { Validator } = require("./validator");
const ethers = require("ethers");

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
            isAdvanced !== null
                ? Validator.isAdvanced(actionScript)
                : !!isAdvanced
        );
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

    encodeSequence({sequence, variables, wallet}) {
        this.sequence = sequence;
        this.variables = variables;
        this.variables["wallet"] = wallet;

        this.isAdvanced = sequence.map(s => (
            !!s.resultsToApply && s.resultsToApply.length > 0 ||
            Validator.isAdvanced(s.actionScript)
        ));

        resultsToApply = [
            {
                sequenceIndex: 0,
                result: "abc",
                variable: "xyz",
            }
        ];

        let sequenceCallIndex = 0;
        const encoded = [];
        const sequenceKnownCallResultVariables = [];
        for (const { actionScript, resultsToApply } of sequence) {
            const encoder = new Encoder(
                actionScript, this.variables, wallet, this.isAdvanced
            );
            encoder.parseActionScriptDefinitions();
            encoder.callIndex = sequenceCallIndex;
            encoder.knownCallResultVariables = {}
            for (const { sequenceIndex, result, variable } of resultsToApply) {
                const resultToApply = sequenceKnownCallResultVariables[sequenceIndex][result];
                encoder.knownCallResultVariables[variable] = resultToApply;
            }
            encoded.push(encoder.encode());
            sequenceCallIndex = encoder.callIndex;
            sequenceKnownCallResultVariables.push(encoder.knownCallResultVariables);
        }

        const calls = [].concat(...encoded.map(x => x.calls));
        const callABIs = [].concat(...encoded.map(x => x.callABIs));
        const resultToParse = encoded
            .map(x => x.resultToParse)
            .reduce((result, obj) => Object.assign({}, result, obj), {});

        return {
            calls,
            callABIs,
            resultToParse,
            isAdvanced: this.isAdvanced,
        };
    }

    static typeSizes(type) {
        if (!(typeof type === "string")) {
            throw new Error("Types must be formatted as strings.");
        }

        if (type === "string" || type === "bytes") {
            throw new Error("Cannot infer size of dynamically-sized types.");
        }

        if (type.includes("[")) {
            throw new Error("Typed array types are not yet supported.");
        }

        if (type.includes("(")) {
            throw new Error("Struct types are not yet supported.");
        }

        return 32;
    }

    static typeZeroPaddings(type) {
        if (!(typeof type === "string")) {
            throw new Error("Types must be formatted as strings.");
        }

        if (type === "string" || type === "bytes") {
            throw new Error("Cannot infer zero-padding of dynamically-sized types.");
        }

        if (type.includes("[")) {
            throw new Error("Typed array types are not yet supported.");
        }

        if (type.includes("(")) {
            throw new Error("Struct types are not yet supported.");
        }

        if (type === "bool") {
            return false;
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

    constructCallAndResultFormat(action) {
        if (typeof action === 'object' && 'if' in action) {
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

            const conditionalActions = action.if[conditionTrue ? 'then' : 'else'];
            for (let conditionalAction of conditionalActions) {
                this.constructCallAndResultFormat(conditionalAction);
            }
        } else if (typeof action === 'object' && 'raw' in action) {
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

            let [contractName, functionName, ...args] = splitActionCalls.split(
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
                } else if (this.isAdvanced && payableArg in this.knownCallResultVariables) {
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
                if (arg in this.variables) {
                    const appliedArg = this.variables[arg];
                    appliedArgs.push(appliedArg);
                } else if (arg in this.targetContracts) {
                    appliedArgs.push(this.targetContracts[arg].address);
                } else if (this.isAdvanced && arg in this.knownCallResultVariables) {
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
                } else if (arg && arg.startsWith("[") && arg.endsWith("]")) {
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

                // parse results
                for (let [resultIndex, result] of Object.entries(splitActionResults)) {
                    if (!(this.callIndex in this.resultToParse)) {
                        this.resultToParse[this.callIndex] = {};
                    }

                    this.resultToParse[this.callIndex][resultIndex] = result;

                    if (this.isAdvanced) {
                        this.knownCallResultVariables[result] = {
                            callIndex: this.callIndex,
                            returndata: this.callResultsByFunction[functionName][resultIndex],
                        };
                    }
                }
            }

            this.callIndex++;
        }
    }

    constructCallsAndResultsFormat() {
        this.calls = [];
        this.callABIs = [];
        this.resultToParse = {};

        const { actions, definitions } = this.actionScript;

        this.callArgumentsByFunction = {};
        this.callResultsByFunction = {};

        if (this.isAdvanced) {
            const getSizesAndOffsetsFromTypes = (types, includeSelector) => {
                if (types.length === 0) {
                    return [];
                }

                const sizes = types.map(
                    Encoder.typeSizes
                );

                const extraOffset = includeSelector ? 4 : 0;
                const offsets = sizes.map(
                    (sum => value => sum += value)(-sizes[0] + extraOffset)
                );

                return types.map(
                    (type, i) => ({
                        type,
                        size: sizes[i],
                        offset: offsets[i],
                    })
                );
            }

            const definitionCallArguments = definitions
                .filter(definition => definition.startsWith("Function "))
                .map(definition => {
                    const functionName = definition.split(' ')[1];
                    const callArgumentTypes = definition.split(' ')[3] === 'fallback'
                        ? []
                        : definition
                            .split(" => ")[0]
                            .replace(":payable", "")
                            .split("(")[1]
                            .slice(0, -1)
                            .split(",")
                            .filter(x => x)
                            .map(x => x.trim(" "));

                    return [
                        functionName,
                        getSizesAndOffsetsFromTypes(
                            callArgumentTypes,
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

            const definitionCallResults = definitions
                .filter(definition => definition.startsWith("Function "))
                .map(definition => {
                    const functionName = definition.split(' ')[1];
                    const callReturnTypes = (definition.split(' => ')[1] || '')
                        .split(' ')
                        .filter(x => x);

                    return [
                        functionName,
                        getSizesAndOffsetsFromTypes(
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
        this.knownCallResultVariables = this.knownCallResultVariables || {};
        for (let action of actions) {
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
                            .split("(")[1]
                            .slice(0, -1);

                        const contractFunctionArguments =
                            allContractFunctionArgumentString.length > 0
                                ? allContractFunctionArgumentString.split(",")
                                : null;

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
                                      ([i, arg]) => ({
                                          name: `${contractFunctionName}Argument${i}`,
                                          type: arg.trim(" "),
                                          internalType: arg.trim(" "),
                                      })
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

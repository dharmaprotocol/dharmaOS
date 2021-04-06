const { Validator } = require("./validator");
const hre = require("hardhat");
const ethers = hre.ethers;

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

class Encoder {
    static typeSizes = (type) => {
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

    static erc20CallArguments = Object.fromEntries([
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
    ]));

    static erc20CallResults = Object.fromEntries([
      'transfer', 'transferFrom', 'approve', 'allowance', 'balanceOf', 'totalSupply'
    ].map(functionName => [
        functionName,
        [{
            type: functionName.includes('l') ? 'uint256' : 'bool',
            size: 32,
            offset: 0
        }]
    ]));

    static async encode(actionScriptName, variables, wallet) {
        const encoder = new Encoder(actionScriptName, variables, wallet);
        await encoder.parseActionScriptDefinitions();
        await encoder.constructCallsAndResultsFormat();

        return encoder.calls;
    }

    constructor(actionScriptName, variables, wallet) {
        this.actionScriptName = actionScriptName;
        this.variables = variables;
        this.variables["wallet"] = wallet;
    }

    constructCallAndResultFormat(action) {
        if (typeof action === 'object' && 'if' in action) {
            const splitConditon = action.if.condition.split(" ");
            const tokenToReplace = splitConditon[0];
            const replacementToken = splitConditon[2];

            const tokenToReplaceAddress = this.contracts[tokenToReplace].address;

            const conditionTrue = (
                replacementToken === 'ETHER' &&
                tokenToReplaceAddress === ETHER_ADDRESS
            ) || (
                tokenToReplaceAddress === (
                    this.contracts[replacementToken] &&
                    this.contracts[replacementToken].address
                )
            );

            const conditionalActions = action.if[conditionTrue ? 'then' : 'else'];
            for (let conditionalAction of conditionalActions) {
                this.constructCallAndResultFormat(conditionalAction);
            }
        } else {
            const appliedArgs = [];

            // parse calls
            const splitActionCalls = action.split(" => ")[0];

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
                } else {
                    appliedPayableArg = payableArg;
                }
            }

            for (let arg of args) {
                if (arg in this.variables) {
                    const appliedArg = this.variables[arg];
                    appliedArgs.push(appliedArg);
                } else if (arg in this.targetContracts) {
                    appliedArgs.push(this.targetContracts[arg].address);
                } else if (this.isAdvanced) {
                    // TODO: determine if the arg in question is "advanced" —
                    // if so, pad it with zeroes based on its type
                    appliedArgs.push(0); // FIX: Obviously this is incorrect
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
                    throw new Error("Unable to encode advanced calls yet!");
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
                    throw new Error("Unable to encode advanced calls yet!");
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
                    throw new Error("Unable to encode advanced calls yet!");
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
                const splitActionResults = action.split(" => ");

                if (splitActionResults.length === 2) {
                    const results = splitActionResults[1].split(" ");

                    for (let [argumentIndex, result] of Object.entries(results)) {
                        if (!(this.callIndex in this.resultToParse)) {
                            this.resultToParse[this.callIndex] = {};
                        }

                        this.resultToParse[this.callIndex][argumentIndex] = result;
                    }
                }
            }

            this.callIndex++;
        }
    }

    async constructCallsAndResultsFormat() {
        const script = await Validator.getActionScript(this.actionScriptName);

        this.calls = [];
        this.callABIs = [];
        this.resultToParse = {};
        this.isAdvanced = script.isAdvanced;

        const { actions, definitions } = script;

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

            const definitionCallArguments = Object.fromEntries(
                definitions
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
                    })
            );

            this.callArgumentsByFunction = {
                ...definitionCallArguments,
                ...Encoder.erc20CallArguments
            };

            const definitionCallResults = Object.fromEntries(
                definitions
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
                    })
            );

            this.callResultsByFunction = {
                ...definitionCallResults,
                ...Encoder.erc20CallResults
            };
        }

        this.callIndex = 0;
        for (let action of actions) {
            this.constructCallAndResultFormat(action);
        }
    }

    async parseActionScriptDefinitions() {
        const script = await Validator.getActionScript(this.actionScriptName);
        const definitions = script.definitions || [];

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

        this.contracts = Object.fromEntries(
            Object.entries(this.targetContracts).map(([name, value]) => {
                return [
                    name,
                    new ethers.Contract(
                        value.address,
                        value.abi,
                        ethers.provider
                    ),
                ];
            })
        );
    }
}

module.exports = {
    Encoder,
};

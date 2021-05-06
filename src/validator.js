const sha3 = require("js-sha3");
const { Importer } = require("./importer");
const { Exporter } = require("./exporter");

const TYPE_CHECKERS = {
    string: (x) => !!x && (typeof x === "string" || x instanceof String),
    array: (x) => !!x && Array.isArray(x) && typeof x === "object",
    object: (x) => !!x && !Array.isArray(x) && typeof x === "object",
    conditionalObject: (x) => !!x && !Array.isArray(x) && typeof x === "object" && "if" in x,
    rawObject: (x) => !!x && !Array.isArray(x) && typeof x === "object" && "raw" in x,
    integerGreaterThanZero: (x) => !!x && !Array.isArray(x) && /^[1-9]\d*$/.test(x.toString()),
};

const VALID_VARIABLE_TYPES = new Set([
    "address",
    "uint256",
    "bool",
    "bytes32",
    "uint8",
    "uint16",
    "int128",
    "bytes"
]);

const INPUT_SELECTORS = new Set([
    "0xa9059cbb", // transfer
    "0x095ea7b3", // approve
]);

// TODO: validate outputs as well?
const ERC20_FUNCTIONS = {
    transfer: ["address", "uint256"],
    transferFrom: ["address", "address", "uint256"],
    approve: ["address", "uint256"],
    allowance: ["address"],
    balanceOf: ["address"],
    totalSupply: [],
};

const TOP_LEVEL_FIELDS_AND_TYPES = {
    name: "string",
    summary: "string",
    variables: "object",
    results: "object",
    chainId: "integerGreaterThanZero",
    definitions: "array",
    inputs: "array",
    actions: "array",
    operations: "array",
    outputs: "array",
    associations: "array",
    description: "string",
};

const CONDITIONAL_FIELDS_AND_TYPES = {
    condition: "string",
    then: "array",
    else: "array",
};

const RAW_FIELDS_AND_TYPES = {
    to: "address",
    value: "uint256",
    data: "bytes",
};

const RESERVED_KEYWORDS = new Set(["wallet", "ETHER"]);

const RESERVED_ACTION_SCRIPT_NAMES = { SEND_TRANSACTION: "SEND_TRANSACTION" };

class Validator {
    static async call() {
        const actionScripts = await Importer.getActionScripts();

        const validator = new Validator();
        validator.setActionScripts(actionScripts);

        validator.validateActionScripts();

        await Exporter.setActionScripts(validator.actionScripts);

        return validator.actionScripts.map(
            script => ({
                ...script,
                isAdvanced: !!validator.advancedScripts.has(script.name),
            })
        );
    }

    static async getActionScriptAndDetermineIfAdvanced(actionScriptName) {
        const actionScript = await Importer.getActionScript(actionScriptName);

        const validator = new Validator();
        validator.setActionScript(actionScript);

        const isAdvanced = validator.validateActionScript(actionScript);
        return {...actionScript, isAdvanced};
    }

    static isAdvanced(actionScript) {
        return Validator.validateActions(actionScript, false);
    }

    getActionScriptAfterParsing(name) {
        const actionScriptOptions = this.actionScripts.filter(
            (script) => script.name === name
        );
        if (actionScriptOptions.length === 0) {
            throw new Error(
                `Could not locate action script with name "${name}"`
            );
        }
        const actionScript = actionScriptOptions[0];
        return actionScript;
    }

    setActionScript(actionScript) {
        if (!this.actionScripts) {
            this.actionScripts = [actionScript];
        } else {
            this.actionScripts = this.actionScripts.push(actionScript);
        }

        const names = this.actionScripts.map((script) => script.name);
        this.namesSet = new Set(names);
        if (this.namesSet.size !== names.length) {
            throw new Error("All action scripts must have a unique name");
        }
    }

    setActionScripts(actionScripts) {
        if (!this.actionScripts) {
            this.actionScripts = actionScripts;
        } else {
            this.actionScripts = this.actionScripts.concat(actionScripts);
        }

        const names = this.actionScripts.map((script) => script.name);
        this.namesSet = new Set(names);
        if (this.namesSet.size !== names.length) {
            throw new Error("All action scripts must have a unique name");
        }
    }

    validateActionScripts() {
        this.advancedScripts = new Set();
        for (const script of this.actionScripts) {
            const isAdvanced = this.validateActionScript(script);
            if (isAdvanced) {
                this.advancedScripts.add(script.name);
            }
        }
    }

    validateActionScript(actionScript) {
        if (
            !(
                TYPE_CHECKERS.object(actionScript) &&
                "name" in actionScript &&
                TYPE_CHECKERS.string(actionScript.name)
            )
        ) {
            throw new Error(
                "All action scripts must be non-array objects with a name"
            );
        }

        const name = actionScript.name;

        for (let [field, type] of Object.entries(
            TOP_LEVEL_FIELDS_AND_TYPES
        )) {
            if (!(field in actionScript)) {
                throw new Error(
                    `Action script "${name}" must contain a "${field}" field`
                );
            }
            if (!TYPE_CHECKERS[type](actionScript[field])) {
                // TODO: allow for chainId to match a declared variable with the
                // correct type
                throw new Error(
                    `Action script "${name}" field "${field}" must be of type "${type}"`
                );
            }
        }

        const validFields = new Set(
            Object.keys(TOP_LEVEL_FIELDS_AND_TYPES)
        );
        for (let field of Object.keys(actionScript)) {
            if (!validFields.has(field)) {
                throw new Error(
                    `Action script "${name}" contains invalid field "${field}"`
                );
            }
        }

        Validator.validateVariablesAndResults(actionScript);
        this.validateDefinitions(actionScript);
        const isAdvanced = Validator.validateActions(actionScript);
        Validator.validateInputs(actionScript);
        Validator.validateOutputs(actionScript);
        Validator.validateAssociations(actionScript);
        // TODO: validate operations / results
        // TODO: validate description strings

        return isAdvanced;
    }

    static validateVariablesAndResults(actionScript) {
        const { name, variables, results } = actionScript;

        // Ensure that no variable or result names are used more than once
        const usedNames = new Set();
        const variableAndResultNames = Object.keys(variables).concat(
            Object.keys(results)
        );
        for (let variableName of variableAndResultNames) {
            if (usedNames.has(variableName)) {
                throw new Error(
                    `Action script "${name}" contains duplicate name "${variableName}" for variable or result`
                );
            }
            usedNames.add(variableName);
        }

        // Ensure that each variable and result has a valid type
        const variablesAndResults = Object.entries({
            ...variables,
            ...results,
        });
        for (let [variableName, type] of variablesAndResults) {
            if (!VALID_VARIABLE_TYPES.has(type)) {
                throw new Error(
                    `Action script "${name}" contains invalid type "${type}" for "${variableName}"`
                );
            }
        }
    }

    validateDefinitions(actionScript) {
        const { name, variables, definitions } = actionScript;
        const declaredDefinitions = new Set();
        const declaredContractsAndTokens = new Set();
        const declaredActions = new Set();
        for (let [i, definition] of Object.entries(definitions)) {
            if (
                !(
                    TYPE_CHECKERS.string(definition) &&
                    (definition.startsWith("Token ") ||
                        definition.startsWith("Contract ") ||
                        definition.startsWith("Function ") ||
                        definition.startsWith("Action "))
                )
            ) {
                throw new Error(
                    `Action script "${name}" definition #${
                        parseInt(i) + 1
                    } does not start with "Token", "Contract", "Function" or "Action" keyword`
                );
            }

            // TODO: remove once composability support is fully implemented!
            if (definition.startsWith("Action")) {
                throw new Error(
                    `Action script "${name}" contains an "Action" — composability is still under development.`
                );
            }

            const splitDefinition = definition.split(" ");

            if (splitDefinition.length < 3) {
                throw new Error(
                    `Action script "${name}" definition #${
                        parseInt(i) + 1
                    } does not contain enough arguments`
                );
            }

            const definitionType = splitDefinition[0];
            const definitionName = splitDefinition[1];

            if (RESERVED_KEYWORDS.has(definitionName)) {
                throw new Error(
                    `Action script "${name}" definition "${definitionName}" uses a reserved keyword`
                );
            }

            if (declaredDefinitions.has(definitionName)) {
                throw new Error(
                    `Action script "${name}" definition "${definitionName}" declared more than once`
                );
            }
            declaredDefinitions.add(definitionName);

            if (definitionType === "Token" || definitionType === "Contract") {
                if (splitDefinition.length !== 3) {
                    throw new Error(
                        `Action script "${name}" ${definitionType} definition #${
                            parseInt(i) + 1
                        } does not contain exactly two arguments (a name and a value)`
                    );
                }

                const definitionValue = splitDefinition[2];
                declaredContractsAndTokens.add(definitionName);

                if (definitionValue in variables) {
                    if (variables[definitionValue] !== "address") {
                        throw new Error(
                            `Action script "${name}" ${definitionType} "${definitionName}" variable "${definitionValue}" is not type "address"`
                        );
                    }
                } else {
                    Validator.ensureValidChecksum(definitionValue);
                }
            } else if (definitionType === "Function") {
                if (splitDefinition.length < 4) {
                    throw new Error(
                        `Action script "${name}" Function definition "${definitionName}" does not contain required name, contract, and function signature arguments`
                    );
                }
                const attachedContract = splitDefinition[2];
                const functionSignature = splitDefinition[3];

                if (!declaredContractsAndTokens.has(attachedContract)) {
                    throw new Error(
                        `Action script "${name}" Function definition "${definitionName}" references Contract or Token ${attachedContract} that has not yet been declared`
                    );
                }

                // TODO: get return value types and validate against assigned
                // result types?
            } else if (definitionType === "Action") {
                if (splitDefinition.length < 3) {
                    throw new Error(
                        `Action script "${name}" Action definition "${definitionName}" does not contain exactly two arguments (a name and an action script name)`
                    );
                }

                const definitionValue = splitDefinition[2];
                declaredActions.add(definitionName);

                if (definitionValue === name) {
                    throw new Error(
                        `Action script "${name}" ${definitionType} "${definitionName}" of "${definitionValue}" refers to itself`
                    );
                }

                if (!this.namesSet.has(definitionValue)) {
                    throw new Error(
                        `Action script "${name}" ${definitionType} "${definitionName}" of "${definitionValue}" cannot be located`
                    );
                }

                // TODO: ensure that recursive imports are not employed anywhere
            } else {
                throw new Error(
                    "Only Token, Contract, Function and Action definitions are currently supported"
                );
            }
        }
    }

    static validateAction(action, index, actionScript, callResultVariables) {
        let hasAdvanced = false;

        const { name, variables, definitions } = actionScript;

        const {
            definedTokensAndContracts,
            definedFunctions,
            definedActions
        } = Validator.getDefinedEntities(actionScript);

        variables.wallet = "address";

        if (!TYPE_CHECKERS.string(action)) {
            throw new Error(
                `Action script "${name}" action #${
                    parseInt(index) + 1
                } is not a string`
            );
        }

        const splitAction = action.split(" ");
        if (splitAction.length < 2) {
            throw new Error(
                `Action script "${name}" action #${
                    parseInt(index) + 1
                } does not contain enough arguments`
            );
        }

        const actionCallResultVariables = (
            action.split(" => ")[1] || ""
        ).split(" ").filter(x => x);

        const actionContract = splitAction[0];

        if (actionContract in definedActions) {
            const targetActionScript = definedActions[actionContract];
            console.log(targetActionScript);
            // TODO: handle defined / inherited actions!
            return [hasAdvanced, callResultVariables];
        }

        let actionFunction = splitAction[1];

        if (actionContract === "ETHER") {
            if (
                !actionFunction.includes(":") &&
                actionFunction.split(":").length !== 2
            ) {
                throw new Error(
                    `Action script "${name}" action #${
                        parseInt(index) + 1
                    } (ETHER) requires a to:amount argument`
                );
            }
            const [to, amount] = actionFunction.split(":");

            if (to in variables) {
                if (variables[to] !== "address") {
                    throw new Error(
                        `Action script "${name}" ETHER recipient variable "${to}" is not type "address"`
                    );
                }
            } else if (callResultVariables.has(to)) {
                hasAdvanced = true;
                // TODO: validate that call result variable is address type
            } else {
                Validator.ensureValidChecksum(to);
            }

            if (amount in variables) {
                if (!variables[amount].startsWith("uint")) {
                    throw new Error(
                        `Action script "${name}" ETHER payment amount variable "${amount}" is not type "uintXXX"`
                    );
                }
            } else if (callResultVariables.has(amount)) {
                hasAdvanced = true;
                // TODO: validate that call result variable is uint type
            } else {
                // TODO: ensure valid number
            }

            // TODO: decide if ETHER calls can have result variables?
            return [hasAdvanced, callResultVariables];
        }

        if (!definedTokensAndContracts.has(actionContract)) {
            throw new Error(
                `Action script "${name}" action #${
                    parseInt(index) + 1
                } refers to undeclared Contract or Token "${actionContract}"`
            );
        }

        // Note: payable checks are performed as part of input validation
        if (actionFunction.includes(":")) {
            actionFunction = actionFunction.split(":")[0];
        }

        if (!definedFunctions.has(actionFunction)) {
            throw new Error(
                `Action script "${name}" action #${
                    parseInt(index) + 1
                } refers to undeclared Function "${actionFunction}"`
            );
        }

        const givenArguments = action.split(" => ")[0].split(" ").slice(2);
        let expectedArgumentTypes;
        if (actionFunction in ERC20_FUNCTIONS) {
            expectedArgumentTypes =
                ERC20_FUNCTIONS[actionFunction];

            const tokenDefinitionList = definitions
                .map((definition) => definition.split(" "))
                .filter((definition) => definition[1] === actionContract);

            if (tokenDefinitionList.length !== 1) {
                throw new Error(
                    `A canonical Contract "${actionContract}" for Function "${actionFunction}" could not be located in definitions!`
                );
            }
            const tokenDefinition = tokenDefinitionList.pop();

            if (tokenDefinition[0] !== "Token") {
                throw new Error(
                    `Function "${actionFunction}" can only be called on contracts declared as a Token`
                );
            }
        } else {
            const functionDefinitionList = definitions
                .filter((definition) =>
                    definition.startsWith(`Function ${actionFunction} `)
                )
                .map((definition) => definition.split(" "));

            if (functionDefinitionList.length !== 1) {
                throw new Error(
                    `A canonical Function "${actionFunction}" could not be located in definitions!`
                );
            }
            const functionDefinition = functionDefinitionList.pop();
            const functionSignature = functionDefinition[3];
            expectedArgumentTypes = functionSignature
                .slice(
                    functionSignature.indexOf("(") + 1,
                    functionSignature.indexOf(")")
                )
                .split(",")
                .filter((x) => !!x);

            if (functionDefinition[2] !== actionContract) {
                throw new Error(
                    `Action script "${name}" action #${
                        parseInt(index) + 1
                    } calls Function "${actionFunction}" on Contract or Token "${actionContract}" when it is actually defined for ${
                        functionDefinition[2]
                    }`
                );
            }
        }

        if (givenArguments.length !== expectedArgumentTypes.length) {
            throw new Error(
                `Function "${actionFunction}" (action #${
                    parseInt(index) + 1
                }) gives ${givenArguments.length} arguments and expects ${
                    expectedArgumentTypes.length
                }`
            );
        }

        for (let [j, givenArgument] of Object.entries(givenArguments)) {
            const expectedArgumentType = expectedArgumentTypes[j];

            if (givenArgument in variables) {
                if (variables[givenArgument] !== expectedArgumentType) {
                    throw new Error(
                        `Action script "${name}" variable "${givenArgument}" on function ${actionFunction} is not type "${expectedArgumentType}"`
                    );
                }
            } else if (callResultVariables.has(givenArgument)) {
                hasAdvanced = true;
                // TODO: determine type of call result variable and validate type
            } else {
                if (expectedArgumentType === "address") {
                    if (!definedTokensAndContracts.has(givenArgument)) {
                        Validator.ensureValidChecksum(givenArgument);
                    }
                } else {
                    // TODO: validate argument is the expected type
                }
            }
        }

        for (const variable of actionCallResultVariables) {
            callResultVariables.add(variable);
        }

        return [hasAdvanced, callResultVariables];
    }

    static getDefinedEntities(actionScript) {
        const { definitions } = actionScript;

        const definedTokensAndContracts = new Set(
            definitions
                .filter(
                    (definition) =>
                        definition.startsWith("Token") ||
                        definition.startsWith("Contract")
                )
                .map((definition) => definition.split(" ")[1])
        );

        const definedFunctions = new Set(
            definitions
                .filter((definition) => definition.startsWith("Function"))
                .map((definition) => definition.split(" ")[1])
                .concat(Object.keys(ERC20_FUNCTIONS))
        );

        const definedActions = definitions
            .filter((definition) => definition.startsWith("Action"))
            .map((definition) => definition.split(" "))
            .map(splitDefinition => ([splitDefinition[1], splitDefinition[2]]))
            .reduce(
                (result, [key, value]) => Object.assign({}, result, {[key]: value}),
                {}
            );

        return {
            definedTokensAndContracts,
            definedFunctions,
            definedActions,
        };
    }

    static validateConditionalAction(action, index, actionScript, callResultVariables) {
        let hasAdvanced;
        const { name } = actionScript;
        if (
            Object.keys(action).length !== 1 ||
            (Object.keys(action)[0] !== 'if' && Object.keys(action)[0] !== 'raw')
        ) {
            throw new Error(
                `Action script "${name}" action #${parseInt(index) + 1} supplies an object that is not a conditional (key: "if")`
            );
        }

        const conditionalValues = Object.values(action)[0];
        if (
            !TYPE_CHECKERS.object(conditionalValues)
        ) {
            throw new Error(
                `Action script "${name}" action #${parseInt(index) + 1} supplies an object that is not a conditional ("if" value is not an object)`
            );
        }

        const validFields = new Set(
            Object.keys(CONDITIONAL_FIELDS_AND_TYPES)
        );
        for (let field of Object.keys(conditionalValues)) {
            if (!validFields.has(field)) {
                throw new Error(
                    `Action script "${name}" condition (action #${parseInt(index) + 1}) contains invalid field "${field}"`
                );
            }
        }

        for (let [field, type] of Object.entries(
            CONDITIONAL_FIELDS_AND_TYPES
        )) {
            if (!(field in conditionalValues)) {
                throw new Error(
                    `Action script "${name}" condition (action #${parseInt(index) + 1}) must contain a "${field}" field`
                );
            }
            if (!TYPE_CHECKERS[type](conditionalValues[field])) {
                throw new Error(
                    `Action script "${name}" condition (action #${parseInt(index) + 1}) field "${field}" must be of type "${type}"`
                );
            }

            if (type === 'array') {
                for (let [conditionalActionIndex, conditionalAction] of Object.entries(conditionalValues[field])) {
                    if (TYPE_CHECKERS.object(conditionalAction)) {
                        try {
                            [hasAdvanced, callResultVariables] = Validator.validateConditionalAction(
                                conditionalAction,
                                conditionalActionIndex,
                                actionScript,
                                callResultVariables
                            );
                        } catch (error) {
                            throw new Error(
                                `Action script "${name}" condition (action #${parseInt(index) + 1}) field "${field}" threw the following error during validation of nested conditional action during conditional action #${parseInt(conditionalActionIndex) + 1}: ${error.message}`
                            );
                        }
                    } else {
                        const splitConditionalAction = conditionalAction.split(" ");

                        try {
                            [hasAdvanced, callResultVariables] = Validator.validateAction(
                                conditionalAction,
                                conditionalActionIndex,
                                actionScript,
                                callResultVariables
                            );
                        } catch (error) {
                            throw new Error(
                                `Action script "${name}" condition (action #${parseInt(index) + 1}) field "${field}" threw the following error during validation during conditional action #${parseInt(conditionalActionIndex) + 1}: ${error.message}`
                            );
                        }
                    }
                }
            }
        }

        return [hasAdvanced, callResultVariables];
    }

    static validateRawAction(action, index, actionScript) {
        const { name } = actionScript;

        if (name !== RESERVED_ACTION_SCRIPT_NAMES.SEND_TRANSACTION) {
            throw new Error(
                `Action script "${name}" is not allowed to define a raw object`
            );
        }

        if (
            Object.keys(action).length !== 1 || Object.keys(action)[0] !== 'raw'
        ) {
            throw new Error(
                `Action script "${name}" action #${parseInt(index) + 1} supplies an object that is not a raw (key: "raw")`
            );
        }

        const validFields = new Set(
            Object.keys(RAW_FIELDS_AND_TYPES)
        );
        for (let field of Object.keys(action.raw)) {
            if (!validFields.has(field)) {
                throw new Error(
                    `Action script "${name}" raw value (action #${parseInt(index) + 1}) contains invalid field "${field}"`
                );
            }
        }
    }

    static validateActions(actionScript, validateAllActions = true) {
        const { actions } = actionScript;
        let isAdvanced = false;
        let callResultVariables = new Set();
        for (let [index, action] of Object.entries(actions)) {
            let hasAdvanced;
            if (TYPE_CHECKERS.conditionalObject(action)) {
                [hasAdvanced, callResultVariables] = Validator.validateConditionalAction(
                    action,
                    index,
                    actionScript,
                    callResultVariables
                )
            } else if (TYPE_CHECKERS.rawObject(action)) {
                Validator.validateRawAction(
                    action,
                    index,
                    actionScript
                )
            } else {
                [hasAdvanced, callResultVariables] = Validator.validateAction(
                    action,
                    index,
                    actionScript,
                    callResultVariables
                );
            }
            if (!!hasAdvanced) {
                isAdvanced = true;
                if (!validateAllActions) {
                    break;
                }
            }
        }

        return isAdvanced;
    }

    static getInputEntities(actionScript) {
        const { definitions } = actionScript;

        const inputFunctions = new Set(["transfer", "approve"]);
        const payableFunctions = new Set([]);
        for (let [i, definition] of Object.entries(definitions)) {
            const splitDefinition = definition.split(" ");

            if (splitDefinition[0] === "Function") {
                const functionName = splitDefinition[1];
                const attachedContract = splitDefinition[2];
                const functionSignature = splitDefinition[3].split(":")[0]; // TODO: handle fallback
                const functionSelector = `0x${sha3
                    .keccak_256(functionSignature)
                    .slice(0, 8)}`;

                if (INPUT_SELECTORS.has(functionSelector)) {
                    inputFunctions.add(functionName);
                }

                if (splitDefinition[3].includes(":payable")) {
                    payableFunctions.add(functionName);
                }
            }
        }

        return {
            inputFunctions,
            payableFunctions,
        };
    }

    static validateInput(action, actionScript, inputTokens) {
        const { name } = actionScript;

        const {
            inputFunctions,
            payableFunctions
        } = Validator.getInputEntities(actionScript);

        const splitAction = action.split(" ");
        let actionContract = splitAction[0];
        let actionFunction = splitAction[1];
        let amountArgument;
        if (actionContract === "ETHER") {
            if (!actionFunction.includes(":")) {
                throw new Error(
                    `Action script "${name}" does not specify both a recipient and an amount as part of an Ether transfer action (i.e. "ETHER recipient:amount")`
                );
            }
            amountArgument = actionFunction.split(":")[1];
        } else if (actionFunction.includes(":")) {
            [actionFunction, amountArgument] = actionFunction.split(":");
            actionContract = "ETHER";
            if (!payableFunctions.has(actionFunction)) {
                throw new Error(
                    `Action script "${name}" does not properly define "${actionFunction}" as a payable function`
                );
            }
        } else if (inputFunctions.has(actionFunction)) {
            amountArgument = splitAction[3];
        } else {
            return inputTokens; // Not an action requiring an input token declaration
        }

        if (!(actionContract in inputTokens)) {
            console.log(inputTokens);
            throw new Error(
                `Action script "${name}" does not properly declare "${actionContract}" as an input token`
            );
        }

        const candidates = inputTokens[actionContract];
        if (!candidates.includes(amountArgument)) {
            // TODO: handle <= raw amounts
            throw new Error(
                `Action script "${name}" action "${actionContract} ${actionFunction}" contains a token transfer or approval input argument "${amountArgument}" that does not map back to a declared input`
            );
        }

        const indexToPop = candidates.indexOf(amountArgument);
        inputTokens[actionContract] = candidates
            .slice(0, indexToPop)
            .concat(candidates.slice(indexToPop + 1));

        return inputTokens;
    }

    static validateInputCombinations(actions, actionScript, inputTokens) {
        const { name } = actionScript;

        const startingInputTokens = {...inputTokens};

        // Determine each action that is a conditional
        const conditionalActions = [];
        for (let [i, action] of Object.entries(actions)) {
            if (TYPE_CHECKERS.conditionalObject(action)) {
                conditionalActions.push(i);
            }
        }

        // Determine the total number of conditional (else or then) combinations
        const conditionalCombinations = [...Array(2 ** conditionalActions.length).keys()]
            .map(a => (
                [...Array(conditionalActions.length).keys()]
                    .map(b => !((a >> b) & 1))
            )).map(combination => combination
                .map((condition, i) => ([conditionalActions[i], condition]))
                    .reduce(
                        (result, [key, value]) => Object.assign({}, result, {[key]: value}),
                        {}
                    )
            );

        // Ensure that each input token is only spent once for each combination
        for (const conditionalCombination of conditionalCombinations) {
            inputTokens = {...startingInputTokens};
            for (let [i, action] of Object.entries(actions)) {
                if (i in conditionalCombination) {
                    const splitCondition = action.if.condition.split(" ");
                    if (splitCondition.length !== 3) {
                        throw new Error(
                            `Action script "${name}" has a condition that does not contain exactly three arguments (for now only "<TOKEN_X> is <TOKEN_Y || ETHER>" and "<variable> is <true || false>" are supported)`
                        );
                    }

                    if (splitCondition[1] !== "is") {
                        throw new Error(
                            `Action script "${name}" has a condition that does not contain a direct comparison (for now only "<TOKEN_X> is <TOKEN_Y || ETHER>" and "<variable> is <true || false>" are supported)`
                        );
                    }

                    const conditionalVariable = splitCondition[0];
                    const comparisonVariable = splitCondition[2];
                    const isBooleanComparison = comparisonVariable === 'true' || comparisonVariable === 'false';

                    let replacement = false;
                    if (
                        conditionalCombination[i] &&
                        conditionalVariable in inputTokens &&
                        !isBooleanComparison
                    ) {
                        replacement = true;
                        const inputValuesToReplace = inputTokens[conditionalVariable];
                        delete inputTokens[conditionalVariable];
                        inputTokens[comparisonVariable] = inputValuesToReplace;
                    }
                    const thenOrElse = conditionalCombination[i] ? "then" : "else";
                    const conditionalActions = action.if[thenOrElse];

                    inputTokens = Validator.validateInputCombinations(
                        conditionalActions, actionScript, {...inputTokens}
                    );

                    if (replacement) {
                        const inputValuesToReplace = inputTokens[comparisonVariable];
                        delete inputTokens[comparisonVariable];
                        inputTokens[conditionalVariable] = inputValuesToReplace;
                    }
                } else if (!TYPE_CHECKERS.rawObject(action)) {
                    inputTokens = Validator.validateInput(action, actionScript, {...inputTokens});
                }
            }
        }

        return inputTokens;
    }

    static validateInputs(actionScript) {
        const { name, variables, definitions, actions, inputs } = actionScript;

        let inputTokens = {};
        for (let [i, inputObjects] of Object.entries(inputs)) {
            if (!TYPE_CHECKERS.object(inputObjects)) {
                throw new Error(
                    `Input #${parseInt(i) + 1} is not a key-value pair`
                );
            }
            const inputList = Object.entries(inputObjects);
            if (inputList.length !== 1) {
                throw new Error(
                    `Input #${parseInt(i) + 1} is not a single key-value pair`
                );
            }
            const [tokenName, inputValue] = inputList.pop();

            if (tokenName in inputTokens) {
                inputTokens[tokenName].push(inputValue);
            } else {
                inputTokens[tokenName] = [inputValue];
            }

            const tokenDefinitions = new Set(
                definitions
                    .filter((definition) => definition.startsWith("Token"))
                    .map((definition) => definition.split(" ")[1])
                    .concat(["ETHER"])
            );

            if (!tokenDefinitions.has(tokenName)) {
                throw new Error(
                    `Input #${
                        parseInt(i) + 1
                    } specifies an undefined token "${tokenName}"`
                );
            }

            if (inputValue in variables) {
                if (variables[inputValue] !== "uint256") {
                    throw new Error(
                        `Action script "${name}" variable "${inputValue}" on input Token "${tokenName}" is not type "uint256"`
                    );
                }
            } else {
                // TODO: validate argument is the expected type
            }
        }

        inputTokens = Validator.validateInputCombinations(
            actions,
            actionScript,
            {...inputTokens},
        );

        // Note: staking, redeeming, or burning tokens may result in inputs that
        // are difficult to detect statically (and will need to be validated via
        // simulation and balance checks) – but it'd look something like this:
        // const residualInputs = Object.values(inputTokens).flat();
        // if (residualInputs.length !== 0) {
        //     console.log(`Note: Action script "${name}" may not utilize "${residualInputs.join(', ')}"`);
        // }
    }

    static validateOutputs(actionScript) {
        const { name, variables, definitions, outputs, actions } = actionScript;
        for (let [i, outputObjects] of Object.entries(outputs)) {
            if (!TYPE_CHECKERS.object(outputObjects)) {
                throw new Error(
                    `Output #${parseInt(i) + 1} is not a key-value pair`
                );
            }
            const outputList = Object.entries(outputObjects);
            if (outputList.length !== 1) {
                throw new Error(
                    `Output #${parseInt(i) + 1} is not a single key-value pair`
                );
            }
            const [tokenName, outputValue] = outputList.pop();

            const tokenDefinitions = new Set(
                definitions
                    .filter((definition) => definition.startsWith("Token"))
                    .map((definition) => definition.split(" ")[1])
                    .concat(["ETHER"])
            );

            if (!tokenDefinitions.has(tokenName)) {
                throw new Error(
                    `Output #${
                        parseInt(i) + 1
                    } specifies an undefined token "${tokenName}"`
                );
            }

            if (outputValue in variables) {
                if (variables[outputValue] !== "uint256") {
                    throw new Error(
                        `Action script "${name}" variable "${outputValue}" on output Token "${tokenName}" is not type "uint256"`
                    );
                }
            } else {
                // TODO: validate argument is the expected type
            }
        }
    }

    static validateAssociations(actionScript) {
        const {
            name,
            variables,
            definitions,
            associations,
            actions,
        } = actionScript;
        for (let [i, associationObjects] of Object.entries(associations)) {
            if (!TYPE_CHECKERS.object(associationObjects)) {
                throw new Error(
                    `Association #${parseInt(i) + 1} is not a key-value pair`
                );
            }
            const associationList = Object.entries(associationObjects);
            if (associationList.length !== 1) {
                throw new Error(
                    `Association #${
                        parseInt(i) + 1
                    } is not a single key-value pair`
                );
            }
            const [tokenName, associationValue] = associationList.pop();

            const tokenDefinitions = new Set(
                definitions
                    .filter((definition) => definition.startsWith("Token"))
                    .map((definition) => definition.split(" ")[1])
                    .concat(["ETHER"])
            );

            if (!tokenDefinitions.has(tokenName)) {
                throw new Error(
                    `Association #${
                        parseInt(i) + 1
                    } specifies an undefined token "${tokenName}"`
                );
            }

            if (associationValue in variables) {
                if (variables[associationValue] !== "uint256") {
                    throw new Error(
                        `Action script "${name}" variable "${associationValue}" on association Token "${tokenName}" is not type "uint256"`
                    );
                }
            } else {
                // TODO: validate argument is the expected type
            }
        }
    }

    static ensureValidChecksum(address) {
        if (
            !TYPE_CHECKERS.string(address) ||
            !address.match(/^0x[0-9A-Fa-f]*$/) ||
            address.length !== 42
        ) {
            throw new Error(
                `Address "${address}" is not a valid variable or 20-byte hex string`
            );
        }

        const chars = address.toLowerCase().substring(2).split("");
        const hashString = sha3.keccak_256(
            new Uint8Array(chars.map((i) => i.charCodeAt(0)))
        );
        const hashBytes = [];
        for (let i = 0; i < hashString.length; i += 2) {
            hashBytes.push(parseInt(hashString.substring(i, i + 2), 16));
        }
        const hash = new Uint8Array(hashBytes);
        for (let i = 0; i < 40; i += 2) {
            if (hash[i >> 1] >> 4 >= 8) {
                chars[i] = chars[i].toUpperCase();
            }
            if ((hash[i >> 1] & 0x0f) >= 8) {
                chars[i + 1] = chars[i + 1].toUpperCase();
            }
        }
        const checksummed = "0x" + chars.join("");

        if (address !== checksummed) {
            throw new Error(
                `Address "${address}" does not match checksum ${checksummed}`
            );
        }

        return true;
    }
}

module.exports = {
    Validator,
};

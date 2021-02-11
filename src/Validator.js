const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const sha3 = require("js-sha3");

class Validator {
	static async call() {
		const validator = new Validator();
		await validator.parseActionScripts();
		validator.validateActionScripts();
		await validator.writeActionScripts();
		return validator.actionScripts;
	}

	static async getActionScript(name) {
		const validator = new Validator();
		await validator.parseActionScripts();
		const actionScriptOptions = validator.actionScripts.filter(script => script.name === name);
		if (actionScriptOptions.length === 0) {
			throw new Error(
				`Could not locate action script with name "${name}"`
			);
		}
		const actionScript = actionScriptOptions[0];
		return actionScript;
	}

	static TYPE_CHECKERS = {
		string: (x => (x && (typeof x === 'string' || x instanceof String))),
		array: (x => (x && Array.isArray(x) && typeof x === 'object')),
		object: (x => (x && !Array.isArray(x) && typeof x === 'object')),
	}

	static VALID_VARIABLE_TYPES = new Set([
		'address',
		'uint256',
		'bool',
		'bytes32',
		'uint8',
		'uint16',
		'int128',
	]);

	static INPUT_SELECTORS = new Set([
		'0xa9059cbb', // transfer
		'0x095ea7b3', // approve
	]);

	// TODO: validate outputs as well?
	static ERC20_FUNCTIONS = {
		'transfer': ['address', 'uint256'],
		'transferFrom': ['address', 'address', 'uint256'],
		'approve': ['address', 'uint256'],
		'allowance': ['address'],
		'balanceOf': ['address'],
		'totalSupply': [],
	};

	static TOP_LEVEL_FIELDS_AND_TYPES = {
		name: 'string',
		summary: 'string',
		variables: 'object',
		results: 'object',
		definitions: 'array',
		inputs: 'array',
		actions: 'array',
		operations: 'array',
		outputs: 'array',
		associations: 'array',
		description: 'string',
	};

	// Note: name, summary, actions and description are all required!
	static TOP_LEVEL_DEFAULTS = {
		variables: {},
		results: {},
		definitions: [],
		inputs: [],
		operations: [],
		outputs: [],
		associations: [],
	}

	static RESERVED_KEYWORDS = new Set(['wallet', 'ETHER']);

	getFilePaths(dir) {
		const dirents = fs.readdirSync(dir, { withFileTypes: true });
		const files = dirents.map((dirent) => {
			const res = path.resolve(dir, dirent.name);
		    return dirent.isDirectory() ? this.getFilePaths(res) : res;
		});
		return files.flat();
	}

	parseActionScriptByPath([name, filepath]) {
		let file;
		try {
			file = fs.readFileSync(filepath, 'utf8');
		} catch (error) {
			throw new Error(
				`Could not locate action script for "${name}" — ${error.message}`
			);
		}

		let parsed;
		try {
			parsed = YAML.parse(file);
		} catch (error) {
			throw new Error(
				`Could not parse "${name}" action script — ${error.message}`
			);
		}

		if (!parsed || !('name' in parsed) || parsed.name !== name) {
			throw new Error(
				`Could not locate "name: ${name}" in the action script with a corresponding file name`
			);
		}

		for (let [field, defaultValue] of Object.entries(Validator.TOP_LEVEL_DEFAULTS)) {
			if (!(field in parsed) || parsed[field] === null) {
				parsed[field] = defaultValue;
			}
		}

		return parsed;
	}

	parseActionScripts() {
	    const filePaths = this.getFilePaths(
	    	path.resolve(__dirname, '../action-scripts')
	    );

	    const relevantFilepaths = filePaths
			.map(x => [path.basename(x, '.yaml'), x])
			.filter(x => x[0] !== '.DS_Store');

		this.actionScriptCategories = relevantFilepaths
			.map(x => path.basename(path.dirname(x[1])));

		if (this.actionScriptCategories.some(category => category === 'action-scripts')) {
			throw new Error(
				"Action scripts cannot be placed at the root level of the /action-scripts directory"
			);
		}

		this.actionScripts = relevantFilepaths
			.map(this.parseActionScriptByPath);
	}

	validateActionScripts() {
		const names = this.actionScripts.map(script => script.name);
		const namesSet = new Set(names);
		if (namesSet.size !== names.length) {
			throw new Error("All action scripts must have a unique name");
		}

		for (const script of this.actionScripts) {
			this.validateActionScript(script);
		}
	}

	async writeActionScripts() {
		const buildDir = path.resolve(__dirname, '../build');
		try {
		  await fs.promises.mkdir(buildDir);
		} catch (e) {}

		for (const script of this.actionScripts) {
			const { name } = script;
			delete script.variables.wallet;
			const scriptJSON = JSON.stringify(script, null, 2);
			fs.writeFile(
				path.resolve(buildDir, `${name}.json`),
				scriptJSON,
				'utf8',
				(err) => {
					if (err) {
						console.error(err);
					}
				}
			);
		}
	}

	validateActionScript(actionScript) {
		if (
			!(
				Validator.TYPE_CHECKERS.object(actionScript) &&
				'name' in actionScript &&
				Validator.TYPE_CHECKERS.string(actionScript.name)
			)
		) {
			throw new Error("All action scripts must be non-array objects with a name");
		}

		const name = actionScript.name;

		for (let [field, type] of Object.entries(Validator.TOP_LEVEL_FIELDS_AND_TYPES)) {
			if (!(field in actionScript)) {
				throw new Error(
					`Action script "${name}" must contain a "${field}" field`
				);
			}
			if (!Validator.TYPE_CHECKERS[type](actionScript[field])) {
				throw new Error(
					`Action script "${name}" field "${field}" must be of type "${type}"`
				);
			}
		}

		const validFields = new Set(Object.keys(Validator.TOP_LEVEL_FIELDS_AND_TYPES));
		for (let field of Object.keys(actionScript)) {
			if (!validFields.has(field)) {
				throw new Error(
					`Action script "${name}" contains invalid field "${field}"`
				);
			}
		}

		Validator.validateVariablesAndResults(actionScript);
		Validator.validateDefinitions(actionScript);
		Validator.validateActions(actionScript);
		Validator.validateInputs(actionScript);
		Validator.validateOutputs(actionScript);
		Validator.validateAssociations(actionScript);
		// TODO: validate operations / results
		// TODO: validate description strings
	}

	static validateVariablesAndResults(actionScript) {
		const { name, variables, results } = actionScript;

		// Ensure that no variable or result names are used more than once
		const usedNames = new Set();
		const variableAndResultNames = Object.keys(variables).concat(Object.keys(results));
		for (let variableName of variableAndResultNames) {
			if (usedNames.has(variableName)) {
				throw new Error(
					`Action script "${name}" contains duplicate name "${variableName}" for variable or result`
				);
			}
			usedNames.add(variableName);
		}

		// Ensure that each variable and result has a valid type
		const variablesAndResults = Object.entries({...variables, ...results});
		for (let [variableName, type] of variablesAndResults) {
			if (!Validator.VALID_VARIABLE_TYPES.has(type)) {
				throw new Error(
					`Action script "${name}" contains invalid type "${type}" for "${variableName}"`
				);
			}
		}
	}

	static validateDefinitions(actionScript) {
		const { name, variables, definitions } = actionScript;
		const declaredDefinitions = new Set();
		const declaredContractsAndTokens = new Set();
		for (let [i, definition] of Object.entries(definitions)) {
			if (!(
				Validator.TYPE_CHECKERS.string(definition) &&
				(
					definition.startsWith("Token ") ||
					definition.startsWith("Contract ") ||
					definition.startsWith("Function ")
				)
			)) {
				throw new Error(
					`Action script "${name}" definition #${parseInt(i) + 1} does not start with "Token", "Contract", or "Function" keyword`
				);
			}
			const splitDefinition = definition.split(' ');

			if (splitDefinition.length < 3) {
				throw new Error(
					`Action script "${name}" definition #${parseInt(i) + 1} does not contain enough arguments`
				);
			}

			const definitionType = splitDefinition[0];
			const definitionName = splitDefinition[1];

			if (Validator.RESERVED_KEYWORDS.has(definitionName)) {
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

			if (
				definitionType === "Token" ||
				definitionType === "Contract"
			) {
				if (splitDefinition.length !== 3) {
					throw new Error(
						`Action script "${name}" ${definitionType} definition #${parseInt(i) + 1} does not contain exactly two arguments (a name and a value)`
					);
				}

				const definitionValue = splitDefinition[2];
				declaredContractsAndTokens.add(definitionName);

				if (definitionValue in variables) {
					if (variables[definitionValue] !== 'address') {
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
			} else {
				throw new Error(
					'Only Token, Contract, and Function definitions are currently supported'
				);
			}
		}
	}

	static validateActions(actionScript) {
		const { name, variables, definitions, actions } = actionScript;
		variables.wallet = 'address';

		const definedTokensAndContracts = new Set(
			definitions
				.filter(definition => (
					definition.startsWith('Token') ||
					definition.startsWith('Contract')
				))
				.map(definition => definition.split(' ')[1])
		);
		const definedFunctions = new Set(
			definitions
				.filter(definition => definition.startsWith('Function'))
				.map(definition => definition.split(' ')[1])
				.concat(Object.keys(Validator.ERC20_FUNCTIONS))
		);

		for (let [i, action] of Object.entries(actions)) {
			if (!Validator.TYPE_CHECKERS.string(action)) {
				throw new Error(
					`Action script "${name}" action #${parseInt(i) + 1} is not a string`
				);
			}

			const splitAction = action.split(' ');
			if (splitAction.length < 2) {
				throw new Error(
					`Action script "${name}" action #${parseInt(i) + 1} does not contain enough arguments`
				);
			}

			const actionContract = splitAction[0];
			let actionFunction = splitAction[1];

			if (actionContract === 'ETHER') {
				if (
					!actionFunction.includes(':') &&
					actionFunction.split(':').length !== 2
				) {
					throw new Error(
						`Action script "${name}" action #${parseInt(i) + 1} (ETHER) requires a to:amount argument`
					);
				}
				const [to, amount] = actionFunction.split(':');

				if (to in variables) {
					if (variables[to] !== 'address') {
						throw new Error(
							`Action script "${name}" ETHER recipient variable "${to}" is not type "address"`
						);
					}
				} else {
					Validator.ensureValidChecksum(to);
				}

				if (amount in variables) {
					if (!variables[amount].startsWith('uint')) {
						throw new Error(
							`Action script "${name}" ETHER payment amount variable "${amount}" is not type "uintXXX"`
						);
					}
				} else {
					// TODO: ensure valid number
				}

				continue;
			}

			if (!definedTokensAndContracts.has(actionContract)) {
				throw new Error(
					`Action script "${name}" action #${parseInt(i) + 1} refers to undeclared Contract or Token "${actionContract}"`
				);
			}

			// Note: payable checks are performed as part of input validation
			if (actionFunction.includes(':')) {
				actionFunction = actionFunction.split(':')[0];
			}

			if (!definedFunctions.has(actionFunction)) {
				throw new Error(
					`Action script "${name}" action #${parseInt(i) + 1} refers to undeclared Function "${actionFunction}"`
				);
			}

			const givenArguments = action.split(' => ')[0].split(' ').slice(2);
			let expectedArgumentTypes;
			if (actionFunction in Validator.ERC20_FUNCTIONS) {
				expectedArgumentTypes = Validator.ERC20_FUNCTIONS[actionFunction];

				const tokenDefinitionList = definitions
					.map(definition => definition.split(' '))
					.filter(definition => definition[1] === actionContract);

				if (tokenDefinitionList.length !== 1) {
					throw new Error(
						`A canonical Contract "${actionContract}" for Function "${actionFunction}" could not be located in definitions!`
					);
				}
				const tokenDefinition = tokenDefinitionList.pop();

				if (tokenDefinition[0] !== 'Token') {
					throw new Error(
						`Function "${actionFunction}" can only be called on contracts declared as a Token`
					);
				}
			} else {
				const functionDefinitionList = definitions
					.filter(definition => definition.startsWith(`Function ${actionFunction} `))
					.map(definition => definition.split(' '));

				if (functionDefinitionList.length !== 1) {
					throw new Error(
						`A canonical Function "${actionFunction}" could not be located in definitions!`
					);
				}
				const functionDefinition = functionDefinitionList.pop();
				const functionSignature = functionDefinition[3];
				expectedArgumentTypes = functionSignature
					.slice(
						functionSignature.indexOf('(') + 1,
						functionSignature.indexOf(')')
					)
					.split(',')
					.filter(x => !!x);

				if (functionDefinition[2] !== actionContract) {
					throw new Error(
						`Action script "${name}" action #${parseInt(i) + 1} calls Function "${actionFunction}" on Contract or Token "${actionContract}" when it is actually defined for ${functionDefinition[2]}`
					);
				}
			}

			if (givenArguments.length !== expectedArgumentTypes.length) {
				throw new Error(
					`Function "${actionFunction}" (action #${parseInt(i) + 1}) gives ${givenArguments.length} arguments and expects ${expectedArgumentTypes.length}`
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
				} else {
					if (expectedArgumentType === 'address') {
						if (!definedTokensAndContracts.has(givenArgument)) {
							Validator.ensureValidChecksum(givenArgument);
						}
					} else {
						// TODO: validate argument is the expected type
					}
				}
			}
		}
	}

	static validateInputs(actionScript) {
		const { name, variables, definitions, inputs, actions } = actionScript;

		const inputFunctions = new Set(['transfer', 'approve']);
		const payableFuntions = new Set([]);
		for (let [i, definition] of Object.entries(definitions)) {
			const splitDefinition = definition.split(' ');

			if (splitDefinition[0] === "Function") {
				const functionName = splitDefinition[1];
				const attachedContract = splitDefinition[2];
				const functionSignature = splitDefinition[3].split(":")[0]; // TODO: handle fallback
				const functionSelector = `0x${sha3.keccak_256(functionSignature).slice(0, 8)}`;

				if (Validator.INPUT_SELECTORS.has(functionSelector)) {
					inputFunctions.add(functionName);
				}

				if (splitDefinition[3].includes(':payable')) {
					payableFuntions.add(functionName);
				}
			}
		}

		const inputTokens = {};
		for (let [i, inputObjects] of Object.entries(inputs)) {
			if (!Validator.TYPE_CHECKERS.object(inputObjects)) {
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
					.filter(definition => definition.startsWith('Token'))
					.map(definition => definition.split(' ')[1])
					.concat(['ETHER'])
			);

			if (!tokenDefinitions.has(tokenName)) {
		    	throw new Error(
		    		`Input #${parseInt(i) + 1} specifies an undefined token "${tokenName}"`
		    	);
			}

			if (inputValue in variables) {
				if (variables[inputValue] !== 'uint256') {
					throw new Error(
						`Action script "${name}" variable "${inputValue}" on input Token "${tokenName}" is not type "uint256"`
					);
				}
			} else {
				// TODO: validate argument is the expected type
			}
		}

		for (let [i, action] of Object.entries(actions)) {
			const splitAction = action.split(' ');
			let actionContract = splitAction[0];
			let actionFunction = splitAction[1];
			let amountArgument;
			if (actionContract === 'ETHER') {
				if (!actionFunction.includes(':')) {
					throw new Error(`Action script "${name}" does not specify both a recipient and an amount as part of an Ether transfer action (i.e. "ETHER recipient:amount")`);
				}
				amountArgument = actionFunction.split(':')[1];
			} else if (actionFunction.includes(':')) {
				[actionFunction, amountArgument] = actionFunction.split(':');
				actionContract = 'ETHER';
				if (!payableFuntions.has(actionFunction)) {
					throw new Error(`Action script "${name}" does not properly define "${actionFunction}" as a payable function`);
				}
			} else if (inputFunctions.has(actionFunction)) {
				amountArgument = splitAction[3];
			} else {
				continue; // Not an action requiring an input token declaration
			}

			if (!(actionContract in inputTokens)) {
				throw new Error(`Action script "${name}" does not properly declare "${actionContract}" as an input token`);
			}

			const candidates = inputTokens[actionContract];
			if (!candidates.includes(amountArgument)) { // TODO: handle <= raw amounts
				throw new Error(`Action script "${name}" action "${actionContract} ${actionFunction}" contains a token transfer or approval input argument "${amountArgument}" that does not map back to a declared input`);
			}

			const indexToPop = candidates.indexOf(amountArgument);
			inputTokens[actionContract] = candidates
				.slice(0, indexToPop)
				.concat(candidates.slice(indexToPop + 1));
		}

		// Note: staking, redeeming, or burning tokens may result in inputs that
		// are difficult to detect statically (and will need to be validated via
		// simulation and balance checks).
		// const residualInputs = Object.values(inputTokens).flat();
		// if (residualInputs.length !== 0) {
		//     console.log(`Note: Action script "${name}" may not utilize "${residualInputs.join(', ')}"`);
		// }
	}

	static validateOutputs(actionScript) {
		const { name, variables, definitions, outputs, actions } = actionScript;
		for (let [i, outputObjects] of Object.entries(outputs)) {
			if (!Validator.TYPE_CHECKERS.object(outputObjects)) {
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
					.filter(definition => definition.startsWith('Token'))
					.map(definition => definition.split(' ')[1])
					.concat(['ETHER'])
			);

			if (!tokenDefinitions.has(tokenName)) {
		    	throw new Error(
		    		`Output #${parseInt(i) + 1} specifies an undefined token "${tokenName}"`
		    	);
			}

			if (outputValue in variables) {
				if (variables[outputValue] !== 'uint256') {
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
		const { name, variables, definitions, associations, actions } = actionScript;
		for (let [i, associationObjects] of Object.entries(associations)) {
			if (!Validator.TYPE_CHECKERS.object(associationObjects)) {
		    	throw new Error(
		    		`Association #${parseInt(i) + 1} is not a key-value pair`
		    	);
			}
			const associationList = Object.entries(associationObjects);
			if (associationList.length !== 1) {
		    	throw new Error(
		    		`Association #${parseInt(i) + 1} is not a single key-value pair`
		    	);
			}
			const [tokenName, associationValue] = associationList.pop();

			const tokenDefinitions = new Set(
				definitions
					.filter(definition => definition.startsWith('Token'))
					.map(definition => definition.split(' ')[1])
					.concat(['ETHER'])
			);

			if (!tokenDefinitions.has(tokenName)) {
		    	throw new Error(
		    		`Association #${parseInt(i) + 1} specifies an undefined token "${tokenName}"`
		    	);
			}

			if (associationValue in variables) {
				if (variables[associationValue] !== 'uint256') {
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
	    	!Validator.TYPE_CHECKERS.string(address) ||
	    	!address.match(/^0x[0-9A-Fa-f]*$/) ||
	    	address.length !== 42
	    ) {
	    	throw new Error(
	    		`Address "${address}" is not a valid variable or 20-byte hex string`
	    	);
	    }

	    const chars = address.toLowerCase().substring(2).split("");
	    const hashString = sha3.keccak_256(new Uint8Array(chars.map(i => i.charCodeAt(0))));
        const hashBytes = [];
        for (let i = 0; i < hashString.length; i += 2) {
            hashBytes.push(parseInt(hashString.substring(i, i + 2), 16));
        }
        const hash = (new Uint8Array(hashBytes));
	    for (let i = 0; i < 40; i += 2) {
	        if ((hash[i >> 1] >> 4) >= 8) {
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
    Validator
};
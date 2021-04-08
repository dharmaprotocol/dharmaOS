const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const sha3 = require("js-sha3");
const { Validator } = require("./validator");
const { Importer } = require("./importer");

class TestValidator {
    static call() {
        const testValidator = new TestValidator();
        testValidator.parseActionScriptTests();
        testValidator.validateActionScriptTests();
        testValidator.generateScenarios();
        return testValidator.scenarios;
    }

    static TYPE_CHECKERS = {
        string: (x) => x && (typeof x === "string" || x instanceof String),
        array: (x) => x && Array.isArray(x) && typeof x === "object",
        object: (x) => x && !Array.isArray(x) && typeof x === "object",
        bool: (x) => x && typeof x === "boolean",
        number: (x) => x && typeof x === "number",
        address: (x) => x && TestValidator.ensureValidChecksum(x),
    };

    static VARIABLE_TYPE_CHECKERS = {
        address: (x) => x && TestValidator.ensureValidChecksum(x),
    };

    static VALID_VARIABLE_TYPES = new Set([
        "address",
        "uint256",
        "bool",
        "bytes32",
        "uint8",
        "uint16",
        "int128",
    ]);

    // TODO: validate outputs as well?
    static ERC20_FUNCTIONS = {
        transfer: ["address", "uint256"],
        transferFrom: ["address", "address", "uint256"],
        approve: ["address", "uint256"],
        allowance: ["address"],
        balanceOf: ["address"],
        totalSupply: [],
    };

    static TOP_LEVEL_FIELDS_AND_TYPES = {
        name: "string",
        blockNumber: "number",
        tests: "array",
    };

    static TEST_LEVEL_FIELDS_AND_TYPES = {
        name: "string",
        success: "bool",
        variables: "object",
        results: "object",
        events: "array",
    };

    static EVENT_LEVEL_FIELDS_AND_TYPES = {
        address: "address",
        name: "string",
        args: "object",
    };

    static TEST_LEVEL_DEFAULTS = {
        success: true,
        variables: {},
        results: {},
        events: [],
    };

    static RESERVED_KEYWORDS = new Set(["wallet", "ETHER"]);

    getFilePaths(dir) {
        const dirents = fs.readdirSync(dir, { withFileTypes: true });
        const files = dirents.map((dirent) => {
            const res = path.resolve(dir, dirent.name);
            return dirent.isDirectory() ? this.getFilePaths(res) : res;
        });
        return files.flat();
    }

    parseActionScriptTestByPath([name, filepath]) {
        let file;
        try {
            file = fs.readFileSync(filepath, "utf8");
        } catch (error) {
            throw new Error(
                `Could not locate action script test for "${name}" — ${error.message}`
            );
        }

        let parsed;
        try {
            parsed = YAML.parse(file);
        } catch (error) {
            throw new Error(
                `Could not parse "${name}" action script test — ${error.message}`
            );
        }

        if (!parsed || !("name" in parsed) || parsed.name !== name) {
            throw new Error(
                `Could not locate "name: ${name}" in the action script tests with a corresponding file name`
            );
        }

        if (
            !(
                "tests" in parsed &&
                TestValidator.TYPE_CHECKERS.array(parsed.tests)
            )
        ) {
            throw new Error(
                `Could not locate "tests" top-level field in the "${name}" action script test`
            );
        }

        for (let test of parsed.tests) {
            for (let [field, defaultValue] of Object.entries(
                TestValidator.TEST_LEVEL_DEFAULTS
            )) {
                if (!(field in test) || test[field] === null) {
                    test[field] = defaultValue;
                }
            }
        }

        return parsed;
    }

    parseActionScriptTests() {
        const filePaths = this.getFilePaths(
            path.resolve(__dirname, "../action-script-tests")
        );

        this.actionScriptTests = filePaths
            .map((x) => [path.basename(x, ".yaml"), x])
            .filter((x) => x[0] !== ".DS_Store")
            .map(this.parseActionScriptTestByPath);

        this.actionScripts = Importer.importActionScriptsFromFile();
    }

    validateActionScriptTests() {
        const names = this.actionScriptTests.map((script) => script.name);
        const namesSet = new Set(names);
        if (namesSet.size !== names.length) {
            throw new Error("All action script tests must have a unique name");
        }

        const actionScriptNames = new Set(
            this.actionScripts.map((script) => script.name)
        );
        const actionScriptTestNames = new Set(
            this.actionScriptTests.map((test) => test.name)
        );
        for (let scriptName of actionScriptNames) {
            if (!actionScriptTestNames.has(scriptName)) {
                throw new Error(`No test found for action script ${scriptName}`);
            }
        }

        for (const test of this.actionScriptTests) {
            this.validateActionScriptTest(test);
        }
    }

    validateActionScriptTest(actionScriptTest) {
        for (let [field, type] of Object.entries(
            TestValidator.TOP_LEVEL_FIELDS_AND_TYPES
        )) {
            if (!(field in actionScriptTest)) {
                throw new Error(
                    `Action script test "${actionScriptTest.name}" must contain a "${field}" field`
                );
            }
            if (!TestValidator.TYPE_CHECKERS[type](actionScriptTest[field])) {
                throw new Error(
                    `Action script test "${actionScriptTest.name}" field "${field}" must be of type "${type}"`
                );
            }
        }
        const { name, blockNumber, tests } = actionScriptTest;

        const actionScriptOptions = this.actionScripts.filter(
            (script) => script.name === name
        );
        if (actionScriptOptions.length === 0) {
            throw new Error(
                `Could not locate action script with name "${name}"`
            );
        }

        const actionScript = actionScriptOptions[0];

        for (let [testNumber, test] of Object.entries(tests)) {
            if (!test || !("name" in test)) {
                throw new Error(
                    `Action script test "${name}" test #${
                        parseInt(testNumber) + 1
                    } does not itself have a "name" field`
                );
            }
            const testName = test.name;

            for (let [field, type] of Object.entries(
                TestValidator.TEST_LEVEL_FIELDS_AND_TYPES
            )) {
                if (!(field in test)) {
                    throw new Error(
                        `Action script test "${testName}" on "${name}" must contain a "${field}" field`
                    );
                }
                if (!TestValidator.TYPE_CHECKERS[type](test[field])) {
                    throw new Error(
                        `Action script test "${testName}" on "${name}" has a field "${field}" that is not of type "${type}"`
                    );
                }
            }

            for (const [variableName, variableType] of Object.entries(
                actionScript.variables
            )) {
                if (!(variableName in test.variables)) {
                    throw new Error(
                        `Action script test "${testName}" on "${name}" is missing variable "${variableName}"`
                    );
                }

                // TODO: expand to other variable types
                if (variableType in TestValidator.VARIABLE_TYPE_CHECKERS) {
                    if (
                        !TestValidator.VARIABLE_TYPE_CHECKERS[variableType](
                            test.variables[variableName]
                        )
                    ) {
                        throw new Error(
                            `Action script test "${testName}" on "${name}" variable "${variableName}" must be of type "${variableType}"`
                        );
                    }
                }
            }

            for (const [resultName, resultType] of Object.entries(
                actionScript.results
            )) {
                if (!(resultName in test.results)) {
                    throw new Error(
                        `Action script test "${testName}" on "${name}" is missing result "${resultName}"`
                    );
                }

                // TODO: expand to other variable types
                if (resultType in TestValidator.VARIABLE_TYPE_CHECKERS) {
                    if (
                        !TestValidator.VARIABLE_TYPE_CHECKERS[resultType](
                            test.results[resultName]
                        )
                    ) {
                        throw new Error(
                            `Action script test "${testName}" on "${name}" result "${resultName}" must be of type "${resultType}"`
                        );
                    }
                }
            }

            for (const [eventIndex, event] of Object.entries(test.events)) {
                for (let [field, type] of Object.entries(
                    TestValidator.EVENT_LEVEL_FIELDS_AND_TYPES
                )) {
                    if (!(field in event)) {
                        throw new Error(
                            `Action script test "${testName}" on "${name}" event #${
                                parseInt(eventIndex) + 1
                            } must contain a "${field}" field`
                        );
                    }
                    if (!TestValidator.TYPE_CHECKERS[type](event[field])) {
                        throw new Error(
                            `Action script test "${testName}" on "${name}" event #${
                                parseInt(eventIndex) + 1
                            } has a field "${field}" that is not of type "${type}"`
                        );
                    }
                }

                for (const [argName, argValue] of Object.entries(event.args)) {
                    // TODO: import contract ABI from file and use to validate
                    // event argument types... note special case of "wallet"
                }
            }
        }
    }

    generateScenarios() {
        this.scenarios = [];
        for (const actionScriptTest of this.actionScriptTests) {
            const {
                name: actionScriptName,
                blockNumber,
                tests,
            } = actionScriptTest;
            for (const test of tests) {
                const {
                    name: testName,
                    success,
                    variables,
                    results,
                    events,
                } = test;
                this.scenarios.push({
                    actionScriptName,
                    testName,
                    variables,
                    blockNumber,
                    success,
                    results,
                    events,
                });
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
    TestValidator,
};

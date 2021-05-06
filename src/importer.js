const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

// Note: name, summary, actions and description are all required!
const TOP_LEVEL_DEFAULTS = {
    variables: {},
    results: {},
    chainId: 1,
    definitions: [],
    inputs: [],
    operations: [],
    outputs: [],
    associations: [],
};

const TEST_LEVEL_DEFAULTS = {
    success: true,
    variables: {},
    results: {},
    events: [],
};

class Importer {
    static async getActionScripts() {
        if (process.env.ACTION_SCRIPT_SOURCE) {
            // TODO: retrieve from alternate source based on configuration file
        } else {
            return Importer.importActionScriptsFromFile();
        }
    }

    static async getActionScript(name) {
        if (process.env.ACTION_SCRIPT_SOURCE) {
            // TODO: retrieve from alternate source based on configuration file
        } else {
            return Importer.importActionScriptFromFile(name);
        }
    }

    static importActionScriptsFromFile() {
        const importer = new Importer();
        return importer.parseActionScripts();
    }

    static importActionScriptFromFile(name) {
        const importer = new Importer();
        return importer.parseActionScript(name);
    }

    static importActionScriptTestsFromFile() {
        const importer = new Importer();
        return importer.parseActionScriptTests();
    }

    static importActionScriptTestFromFile(name) {
        const importer = new Importer();
        return importer.parseActionScriptTest(name);
    }

    getFilePaths(dir) {
        const dirents = fs.readdirSync(dir, { withFileTypes: true });
        const files = dirents.map((dirent) => {
            const res = path.resolve(dir, dirent.name);
            return dirent.isDirectory() ? this.getFilePaths(res) : res;
        });
        return [].concat(...files);
    }

    static checkCategory(filepath, rootCategory) {
        const category = path.basename(path.dirname(filepath));

        if (category === rootCategory) {
            const readableCategory = rootCategory
                .charAt(0)
                .toUpperCase()
                .concat(rootCategory.slice(1))
                .replace("-", " ");

            throw new Error(
                `${readableCategory} cannot be placed at the root level of the /${rootCategory} directory`
            );
        }
    }

    static parseFileAndApplyDefaults(name, filepath, isTest = false) {
        let file;
        try {
            file = fs.readFileSync(filepath, "utf8");
        } catch (error) {
            throw new Error(
                `Could not locate action script ${isTest ? "test " : ""}for "${name}" — ${error.message}`
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

        if (!parsed || !("name" in parsed) || parsed.name !== name) {
            throw new Error(
                `Could not locate "name: ${name}" in the action script with a corresponding file name`
            );
        }

        for (let [field, defaultValue] of Object.entries(
            !isTest ? TOP_LEVEL_DEFAULTS : TEST_LEVEL_DEFAULTS
        )) {
            if (!(field in parsed) || parsed[field] === null) {
                parsed[field] = defaultValue;
            }
        }

        return parsed;
    }

    parseActionScriptByPath([name, filepath]) {
        Importer.checkCategory(filepath, "action-scripts");

        return Importer.parseFileAndApplyDefaults(name, filepath);
    }

    parseActionScriptTestByPath([name, filepath]) {
        Importer.checkCategory(filepath, "action-script-tests");

        return Importer.parseFileAndApplyDefaults(name, filepath, true);
    }

    locateRelevantFilepaths(category) {
        const filePaths = this.getFilePaths(
            path.resolve(__dirname, `../${category}`)
        );

        this.relevantFilepaths = {};
        this.relevantFilepaths[category] = filePaths
            .map((x) => [path.basename(x, ".yaml"), x])
            .filter((x) => x[0] !== ".DS_Store");
    }

    parseActionScripts() {
        this.locateRelevantFilepaths('action-scripts');

        return this.relevantFilepaths['action-scripts'].map(
            this.parseActionScriptByPath
        );
    }

    parseActionScript(name) {
        this.locateRelevantFilepaths('action-scripts');

        const relevantFilepath = this.relevantFilepaths['action-scripts'].filter(
            ([filename, filepath]) => filename === name
        );
        if (relevantFilepath.length === 0) {
            throw new Error(
                `Could not locate action script with name "${name}"`
            );
        }
        return this.parseActionScriptByPath(relevantFilepath[0]);
    }

    parseActionScriptTests() {
        this.locateRelevantFilepaths('action-script-tests');

        return this.relevantFilepaths['action-script-tests'].map(
            this.parseActionScriptTestByPath
        );
    }

    parseActionScriptTest(name) {
        this.locateRelevantFilepaths('action-script-tests');

        const relevantFilepath = this.relevantFilepaths['action-script-tests'].filter(
            ([filename, filepath]) => filename === name
        );
        if (relevantFilepath.length === 0) {
            throw new Error(
                `Could not locate action script test with name "${name}"`
            );
        }
        return this.parseActionScriptTestByPath(relevantFilepath[0]);
    }
}

module.exports = {
    Importer,
};

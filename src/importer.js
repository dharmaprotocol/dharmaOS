const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

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

    // Note: name, summary, actions and description are all required!
    static TOP_LEVEL_DEFAULTS = {
        variables: {},
        results: {},
        definitions: [],
        inputs: [],
        operations: [],
        outputs: [],
        associations: [],
    };

    getFilePaths(dir) {
        const dirents = fs.readdirSync(dir, { withFileTypes: true });
        const files = dirents.map((dirent) => {
            const res = path.resolve(dir, dirent.name);
            return dirent.isDirectory() ? this.getFilePaths(res) : res;
        });
        return files.flat();
    }

    parseActionScriptByPath([name, filepath]) {
        const actionScriptCategory = path.basename(path.dirname(filepath));

        if (actionScriptCategory === "action-scripts") {
            throw new Error(
                "Action scripts cannot be placed at the root level of the /action-scripts directory"
            );
        }

        let file;
        try {
            file = fs.readFileSync(filepath, "utf8");
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

        if (!parsed || !("name" in parsed) || parsed.name !== name) {
            throw new Error(
                `Could not locate "name: ${name}" in the action script with a corresponding file name`
            );
        }

        for (let [field, defaultValue] of Object.entries(
            Importer.TOP_LEVEL_DEFAULTS
        )) {
            if (!(field in parsed) || parsed[field] === null) {
                parsed[field] = defaultValue;
            }
        }

        return parsed;
    }

    locateRelevantFilepaths() {
        const filePaths = this.getFilePaths(
            path.resolve(__dirname, "../action-scripts")
        );

        this.relevantFilepaths = filePaths
            .map((x) => [path.basename(x, ".yaml"), x])
            .filter((x) => x[0] !== ".DS_Store");
    }

    parseActionScripts() {
        this.locateRelevantFilepaths();

        return this.relevantFilepaths.map(
            this.parseActionScriptByPath
        );
    }

    parseActionScript(name) {
        this.locateRelevantFilepaths();

        const relevantFilepath = this.relevantFilepaths.filter(
            ([filename, filepath]) => filename === name
        );
        if (relevantFilepath.length === 0) {
            throw new Error(
                `Could not locate action script with name "${name}"`
            );
        }
        return this.parseActionScriptByPath(relevantFilepath[0]);
    }
}

module.exports = {
    Importer,
};

const fs = require("fs");
const path = require("path");

class Exporter {
    static async setActionScripts(actionScripts) {
        if (process.env.ACTION_SCRIPT_SOURCE) {
            // TODO: write to alternate source based on configuration file
        } else {
            Exporter.writeActionScriptsToFile(actionScripts);
        }
    }

    static async setActionScript(actionScript) {
        if (process.env.ACTION_SCRIPT_SOURCE) {
            // TODO: retrieve from alternate source based on configuration file
        } else {
            Exporter.writeActionScriptsToFile([actionScript]);
        }
    }

    static async writeActionScriptsToFile(actionScripts) {
        const buildDir = path.resolve(__dirname, "../build");
        try {
            await fs.promises.mkdir(buildDir);
        } catch (e) {}

        for (const script of actionScripts) {
            const { name } = script;
            delete script.variables.wallet;
            const scriptJSON = JSON.stringify(script, null, 2);
            fs.writeFile(
                path.resolve(buildDir, `${name}.json`),
                scriptJSON,
                "utf8",
                (err) => {
                    if (err) {
                        console.error(err);
                    }
                }
            );
        }
    }
}

module.exports = {
    Exporter,
};

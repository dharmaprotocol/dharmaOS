const { Validator } = require("./Validator");

const validateAndBuild = async () => {
    const all = await Validator.call();
    console.log(`Validated and built ${all.length} action scripts.`);
};

validateAndBuild();

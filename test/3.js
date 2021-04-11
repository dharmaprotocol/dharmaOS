if (typeof process.env.CI_THREAD === 'undefined' || process.env.CI_THREAD === "3") {
	require("../src/test-template")(3);
}
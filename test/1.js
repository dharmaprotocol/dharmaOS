if (typeof process.env.CI_THREAD === 'undefined' || process.env.CI_THREAD === "1") {
	require("../src/test-template")(1);
}
console.log(process.env.CI_THREAD, typeof process.env.CI_THREAD);
if (typeof process.env.CI_THREAD === "undefined" || process.env.CI_THREAD === "0") {
	require("../src/test-template")(0);
}
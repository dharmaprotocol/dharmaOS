const { expect } = require("chai");
const { evaluate } = require("../src/evaluate");
const { TestValidator } = require("../src/TestValidator");

const testScenario = async (scenario) => {
    let evaluatedSuccess;
    let evaluatedResults;
    let evaluatedEvents;

    const {
        actionScriptName,
        testName,
        variables,
        blockNumber,
        success: expectedSuccess,
        results: expectedResults = {},
        events: expectedEvents = [],
    } = scenario;

    describe(`${actionScriptName}: ${testName}`, function() {
        before(async function() {
            const data = await evaluate(
                actionScriptName,
                variables,
                blockNumber
            );

            evaluatedSuccess = data.success;
            evaluatedResults = data.results;
            evaluatedEvents  = data.events;
        });

        it(`expect success to be ${expectedSuccess}`, async function() {
            expect(evaluatedSuccess).to.equal(expectedSuccess);
        });

        for (const [resultName, resultValue] of Object.entries(expectedResults)) {

            it(`expect result ${resultName} to equal ${resultValue}`, async function() {
                expect(evaluatedResults[resultName]).to.equal(resultValue);
            });
        }

        it(`expect events length to be ${expectedEvents.length}`, async function() {
            expect(evaluatedEvents.length).to.equal(expectedEvents.length);
        });

        for (const [i, { address: expectedAddress, name: expectedName, args: expectedArgs }] of Object.entries(expectedEvents)) {

            it(`expect event address to be ${expectedAddress}`, async function() {
                const {
                    address: evaluatedAddress,
                } = evaluatedEvents[i];

                expect(evaluatedAddress).to.equal(expectedAddress);
            });

            it(`expect event name to be ${expectedName}`, async function() {
                const {
                    name: evaluatedName,
                } = evaluatedEvents[i];

                expect(evaluatedName).to.equal(expectedName);
            });

            for (const [expectedArgName, expectedArgValue] of Object.entries(expectedArgs)) {
                it(`expect event arg ${expectedArgName} to be ${expectedArgValue}`, async function() {
                    const {
                        args: evaluatedArgs,
                    } = evaluatedEvents[i];

                    expect(evaluatedArgs[expectedArgName]).to.equal(expectedArgValue);
                });

            }
        }
    });
}

describe("Action Scripts", async () => {
    const scenarios = TestValidator.call();
    console.log(`Running tests for ${scenarios.length} action script scenarios...`);
    await Promise.all(scenarios.map(testScenario));
});
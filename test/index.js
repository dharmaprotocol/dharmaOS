const { expect } = require("chai");
const { evaluate } = require("../src/setup");

const scenarios = [{
    actionScriptName: "SWAP_ON_CURVE",
    variables: {
        soldTokenAmount: "1000000000000000000",
        soldTokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        boughtTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        curvePoolAddress: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
        soldTokenIndex: 0,
        boughtTokenIndex: 1,
        minimumBoughtTokenAmount: "900000",
    },
    blockNumber: 11095000,
    results: { boughtTokenAmount: '1007566' },
    events: [
        {
            address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            name: 'Approval',
            args: {
                owner: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
                spender: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7',
                value: '1000000000000000000'
            }
        },
        {
            address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            name: 'Transfer',
            args: {
                from: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
                to: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7',
                value: '1000000000000000000'
            }
        },
        {
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            name: 'Transfer',
            args: {
                from: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7',
                to: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
                value: '1007566'
            }
        },
        {
            address: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7',
            name: 'TokenExchange',
            args: {
                buyer: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
                sold_id: '0',
                tokens_sold: '1000000000000000000',
                bought_id: '1',
                tokens_bought: '1007566'
            }
        }
    ]
}];

describe("Action Scripts", function() {

    for (let scenario of scenarios) {

        let success;
        let evaluatedResults;
        let evaluatedEvents;

        const {
            actionScriptName,
            variables,
            blockNumber,
            results: expectedResults = {},
            events: expectedEvents = [],
        } = scenario;

        before(async function() {
            const data = await evaluate(
                actionScriptName,
                variables,
                blockNumber
            );
            success = data.success;
            evaluatedResults = data.results;
            evaluatedEvents  = data.events;

        });

        it(`${actionScriptName}: success`, async function() {
            expect(success).to.equal(true);
        });

        for (const [resultName, resultValue] of Object.entries(expectedResults)) {

            it(`${actionScriptName}: expect result ${resultName} to equal ${resultValue}`, async function() {
                expect(evaluatedResults[resultName]).to.equal(resultValue);
            });
        }

        it(`${actionScriptName}: expect events length to be ${expectedEvents.length}`, async function() {
            expect(evaluatedEvents.length).to.equal(expectedEvents.length);
        });

        for (const [i, { address: expectedAddress, name: expectedName, args: expectedArgs }] of Object.entries(expectedEvents)) {

            it(`${actionScriptName}: expect event address to be ${expectedAddress}`, async function() {
                const {
                    address: evaluatedAddress,
                } = evaluatedEvents[i];

                expect(evaluatedAddress).to.equal(expectedAddress);
            });

            it(`${actionScriptName}: expect event name to be ${expectedName}`, async function() {
                const {
                    name: evaluatedName,
                } = evaluatedEvents[i];

                expect(evaluatedName).to.equal(expectedName);
            });

            for (const [expectedArgName, expectedArgValue] of Object.entries(expectedArgs)) {
                it(`${actionScriptName}: expect event arg ${expectedArgName} to be ${expectedArgValue}`, async function() {
                    const {
                        args: evaluatedArgs,
                    } = evaluatedEvents[i];

                    expect(evaluatedArgs[expectedArgName]).to.equal(expectedArgValue);
                });

            }
        }
    }
});


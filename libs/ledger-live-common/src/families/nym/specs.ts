import expect from "expect";
import sample from "lodash/sample";
import sampleSize from "lodash/sampleSize";
import invariant from "invariant";
import { BigNumber } from "bignumber.js";
import type {
  NymAccount,
  NymDelegation,
  NymRedelegation,
  NymResources,
  NymUnbonding,
  Transaction,
} from "../../families/nym/types";
import { getCurrentNymPreloadData } from "../../families/nym/preloadedData";
import { getCryptoCurrencyById } from "../../currencies";
import {
  pickSiblings,
  botTest,
  expectSiblingsHaveSpendablePartGreaterThan,
  genericTestDestination,
} from "../../bot/specs";
import type { AppSpec } from "../../bot/types";
import { toOperationRaw } from "../../account";
import {
  canDelegate,
  canUndelegate,
  canRedelegate,
  getMaxDelegationAvailable,
} from "./logic";
import { DeviceModelId } from "@ledgerhq/devices";
import { acceptTransaction } from "./speculos-deviceActions";

const minAmount = new BigNumber(10000);
const maxAccounts = 32;

// amounts of delegation are not exact so we are applying an approximation
function approximateValue(value) {
  return "~" + value.div(100).integerValue().times(100).toString();
}

function approximateExtra(extra) {
  extra = { ...extra };
  if (extra.validators && Array.isArray(extra.validators)) {
    extra.validators = extra.validators.map((v) => {
      if (!v) return v;
      const { amount, ...rest } = v;
      if (!amount || typeof amount !== "string") return v;
      return { ...rest, amount: approximateValue(new BigNumber(amount)) };
    });
  }
  return extra;
}

const nym: AppSpec<Transaction> = {
  name: "Nym",
  currency: getCryptoCurrencyById("nym"),
  appQuery: {
    model: DeviceModelId.nanoS,
    appName: "Nym",
  },
  genericDeviceAction: acceptTransaction,
  testTimeout: 2 * 60 * 1000,
  minViableAmount: minAmount,
  transactionCheck: ({ maxSpendable }) => {
    invariant(maxSpendable.gt(minAmount), "balance is too low");
  },
  test: ({ account, operation, optimisticOperation }) => {
    const allOperationsMatchingId = account.operations.filter(
      (op) => op.id === operation.id
    );
    if (allOperationsMatchingId.length > 1) {
      console.warn(allOperationsMatchingId);
    }
    botTest("only one operation resulted", () =>
      expect({ allOperationsMatchingId }).toEqual({
        allOperationsMatchingId: [operation],
      })
    );
    const opExpected: Record<string, any> = toOperationRaw({
      ...optimisticOperation,
    });
    delete opExpected.value;
    delete opExpected.fee;
    delete opExpected.date;
    delete opExpected.blockHash;
    delete opExpected.blockHeight;
    const extra = opExpected.extra;
    delete opExpected.extra;
    const op = toOperationRaw(operation);
    botTest("optimistic operation matches", () =>
      expect(op).toMatchObject(opExpected)
    );
    botTest("optimistic operation extra matches", () =>
      expect(approximateExtra(op.extra)).toMatchObject(approximateExtra(extra))
    );
  },
  mutations: [
    {
      name: "send some",
      maxRun: 2,
      testDestination: genericTestDestination,
      test: ({ account, accountBeforeTransaction, operation }) => {
        expect(account.balance.toString()).toBe(
          accountBeforeTransaction.balance.minus(operation.value).toString()
        );
      },
      transaction: ({ account, siblings, bridge, maxSpendable }) => {
        const amount = maxSpendable
          .times(0.3 + 0.4 * Math.random())
          .integerValue();
        invariant(amount.gt(0), "random amount to be positive");
        return {
          transaction: bridge.createTransaction(account),
          updates: [
            {
              recipient: pickSiblings(siblings, maxAccounts).freshAddress,
            },
            {
              amount,
            },
            Math.random() < 0.5
              ? {
                  memo: "LedgerLiveBot",
                }
              : null,
          ],
        };
      },
    },
    {
      name: "send max",
      maxRun: 1,
      testDestination: genericTestDestination,
      transaction: ({ account, siblings, bridge }) => {
        return {
          transaction: bridge.createTransaction(account),
          updates: [
            {
              recipient: pickSiblings(siblings, maxAccounts).freshAddress,
            },
            {
              useAllAmount: true,
            },
          ],
        };
      },
      test: ({ account }) => {
        botTest("spendableBalance should go to ZERO", () =>
          expect(account.spendableBalance.toString()).toBe("0")
        );
      },
    },
    {
      name: "delegate new validators",
      maxRun: 1,
      transaction: ({ account, bridge, siblings }) => {
        expectSiblingsHaveSpendablePartGreaterThan(siblings, 0.5);
        invariant(
          account.index % 2 > 0,
          "only one out of 2 accounts is not going to delegate"
        );
        invariant(canDelegate(account as NymAccount), "can delegate");
        const { nymResources } = account as NymAccount;
        invariant(nymResources, "nym");
        invariant(
          (nymResources as NymResources).delegations.length < 3,
          "already enough delegations"
        );
        const data = getCurrentNymPreloadData();
        const count = 1; // we'r always going to have only one validator because of the new delegation flow.
        let remaining = getMaxDelegationAvailable(account as NymAccount, count)
          .minus(minAmount.times(2))
          .times(0.1 * Math.random());
        invariant(remaining.gt(0), "not enough funds in account for delegate");
        const all = data.validators.filter(
          (v) =>
            !(nymResources as NymResources).delegations.some(
              // new delegations only
              (d) => d.validatorAddress === v.validatorAddress
            )
        );
        invariant(all.length > 0, "no validators found");
        const validators = sampleSize(all, count)
          .map((delegation) => {
            // take a bit of remaining each time (less is preferred with the random() square)
            const amount = remaining
              .times(Math.random() * Math.random())
              .integerValue();
            remaining = remaining.minus(amount);
            return {
              address: delegation.validatorAddress,
              amount,
            };
          })
          .filter((v) => v.amount.gt(0));
        invariant(validators.length > 0, "no possible delegation found");
        return {
          transaction: bridge.createTransaction(account),
          updates: [
            {
              memo: "LedgerLiveBot",
              mode: "delegate",
            },
            {
              validators: validators,
            },
            { amount: validators[0].amount },
          ],
        };
      },
      test: ({ account, transaction }) => {
        const { nymResources } = account as NymAccount;
        invariant(nymResources, "nym");
        transaction.validators.forEach((v) => {
          const d = (nymResources as NymResources).delegations.find(
            (d) => d.validatorAddress === v.address
          );
          invariant(d, "delegated %s must be found in account", v.address);
          botTest("delegator have planned address and amount", () =>
            expect({
              address: v.address,
              amount: approximateValue(v.amount),
            }).toMatchObject({
              address: (d as NymDelegation).validatorAddress,
              amount: approximateValue((d as NymDelegation).amount),
            })
          );
        });
      },
    },
    {
      name: "undelegate",
      maxRun: 5,
      transaction: ({ account, bridge }) => {
        invariant(canUndelegate(account as NymAccount), "can undelegate");
        const { nymResources } = account as NymAccount;
        invariant(nymResources, "nym");
        invariant(
          (nymResources as NymResources).delegations.length > 0,
          "already enough delegations"
        );
        const undelegateCandidate = sample(
          (nymResources as NymResources).delegations.filter(
            (d) =>
              !(nymResources as NymResources).redelegations.some(
                (r) =>
                  r.validatorSrcAddress === d.validatorAddress ||
                  r.validatorDstAddress === d.validatorAddress
              ) &&
              !(nymResources as NymResources).unbondings.some(
                (r) => r.validatorAddress === d.validatorAddress
              )
          )
        );
        invariant(undelegateCandidate, "already pending");

        const amount = (undelegateCandidate as NymDelegation).amount
          .times(Math.random() > 0.2 ? 1 : Math.random()) // most of the time, undelegate all
          .integerValue();
        invariant(amount.gt(0), "random amount to be positive");

        return {
          transaction: bridge.createTransaction(account),
          updates: [
            {
              mode: "undelegate",
              memo: "LedgerLiveBot",
            },
            {
              validators: [
                {
                  address: (undelegateCandidate as NymDelegation)
                    .validatorAddress,
                  amount,
                },
              ],
            },
          ],
        };
      },
      test: ({ account, transaction }) => {
        const { nymResources } = account as NymAccount;
        invariant(nymResources, "nym");
        transaction.validators.forEach((v) => {
          const d = (nymResources as NymResources).unbondings.find(
            (d) => d.validatorAddress === v.address
          );
          invariant(d, "undelegated %s must be found in account", v.address);
          botTest("validator have planned address and amount", () =>
            expect({
              address: v.address,
              amount: approximateValue(v.amount),
            }).toMatchObject({
              address: (d as NymUnbonding).validatorAddress,
              amount: approximateValue((d as NymUnbonding).amount),
            })
          );
        });
      },
    },
    {
      name: "redelegate",
      maxRun: 1,
      transaction: ({ account, bridge }) => {
        const { nymResources } = account as NymAccount;
        invariant(nymResources, "nym");
        const sourceDelegation = sample(
          (nymResources as NymResources).delegations.filter((d) =>
            canRedelegate(account as NymAccount, d)
          )
        );
        invariant(sourceDelegation, "none can redelegate");
        const delegation = sample(
          (nymResources as NymResources).delegations.filter(
            (d) =>
              d.validatorAddress !==
              (sourceDelegation as NymDelegation).validatorAddress
          )
        );
        const amount = (sourceDelegation as NymDelegation).amount
          .times(
            // most of the time redelegate all
            Math.random() > 0.2 ? 1 : Math.random()
          )
          .integerValue();
        invariant(amount.gt(0), "random amount to be positive");
        return {
          transaction: bridge.createTransaction(account),
          updates: [
            {
              mode: "redelegate",
              memo: "LedgerLiveBot",
              sourceValidator: (sourceDelegation as NymDelegation)
                .validatorAddress,
              validators: [
                {
                  address: (delegation as NymDelegation).validatorAddress,
                  amount,
                },
              ],
            },
          ],
        };
      },
      test: ({ account, transaction }) => {
        const { nymResources } = account as NymAccount;
        invariant(nymResources, "nym");
        transaction.validators.forEach((v) => {
          // we possibly are moving from one existing delegation to another existing.
          // in that case it's not a redelegation, it effects immediately
          const existing = (nymResources as NymResources).delegations.find(
            (d) => d.validatorAddress === v.address
          );
          if (!existing) {
            // in other case, we will find it in a redelegation
            const d = (nymResources as NymResources).redelegations
              .slice(0) // recent first
              .sort(
                // FIXME: valueOf for date arithmetic operations in typescript
                (a, b) =>
                  b.completionDate.valueOf() - a.completionDate.valueOf()
              ) // find the related redelegation
              .find(
                (d) =>
                  d.validatorDstAddress === v.address &&
                  d.validatorSrcAddress === transaction.sourceValidator
              );
            invariant(d, "redelegated %s must be found in account", v.address);
            botTest("validator have planned address and amount", () =>
              expect({
                address: v.address,
                amount: approximateValue(v.amount),
              }).toMatchObject({
                address: (d as NymRedelegation).validatorDstAddress,
                amount: approximateValue((d as NymRedelegation).amount),
              })
            );
          }
        });
      },
    },
    {
      name: "claim rewards",
      maxRun: 1,
      transaction: ({ account, bridge }) => {
        const { nymResources } = account as NymAccount;
        invariant(nymResources, "nym");
        const delegation = sample(
          (nymResources as NymResources).delegations.filter((d) =>
            d.pendingRewards.gt(1000)
          )
        ) as NymDelegation;
        invariant(delegation, "no delegation to claim");
        return {
          transaction: bridge.createTransaction(account),
          updates: [
            {
              mode: "claimReward",
              memo: "LedgerLiveBot",
              validators: [
                {
                  address: delegation.validatorAddress,
                  amount: delegation.pendingRewards,
                },
              ],
            },
          ],
        };
      },
      test: ({ account, transaction }) => {
        const { nymResources } = account as NymAccount;
        invariant(nymResources, "nym");
        transaction.validators.forEach((v) => {
          const d = (nymResources as NymResources).delegations.find(
            (d) => d.validatorAddress === v.address
          );
          botTest("delegation exists in account", () =>
            invariant(d, "delegation %s must be found in account", v.address)
          );
          botTest("reward is no longer claimable after claim", () =>
            invariant(
              d?.pendingRewards.lte(d.amount.multipliedBy(0.1)),
              "pending reward is not reset"
            )
          );
        });
      },
    },
  ],
};
export default {
  nym,
};

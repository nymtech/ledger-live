import invariant from "invariant";
import { renderHook, act } from "@testing-library/react-hooks";
import { getAccountUnit } from "../../account";
import { getAccountBridge, getCurrencyBridge } from "../../bridge";
import { getCryptoCurrencyById } from "../../currencies";
import { setEnv } from "../../env";
import { makeBridgeCacheSystem } from "../../bridge/cache";
import { genAccount, genAddingOperationsInAccount } from "../../mock/account";
import type {
  NymAccount,
  NymDelegation,
  NymMappedDelegation,
  NymResources,
  NymValidatorItem,
  Transaction,
} from "./types";
import { getCurrentNymPreloadData } from "./preloadedData";
import preloadedMockData from "./preloadedData.mock";
import * as hooks from "./react";
import { LEDGER_VALIDATOR_ADDRESS } from "./utils";
import { CurrencyBridge } from "@ledgerhq/types-live";
const localCache = {};
const cache = makeBridgeCacheSystem({
  saveData(c, d) {
    localCache[c.id] = d;
    return Promise.resolve();
  },

  getData(c) {
    return Promise.resolve(localCache[c.id]);
  },
});
describe("nym/react", () => {
  describe("useNymFamilyPreloadData", () => {
    it("should return Nym preload data and updates", async () => {
      const { prepare } = setup();
      const { result } = renderHook(() => hooks.useNymFamilyPreloadData("nym"));
      const data = getCurrentNymPreloadData();
      expect(result.current).toStrictEqual(data);
      await act(() => prepare());
      expect(result.current).toStrictEqual(preloadedMockData);
    });
  });
  describe("useNymFormattedDelegations", () => {
    it("should return formatted delegations", async () => {
      const { account, prepare } = setup();
      await prepare();
      const { result } = renderHook(() =>
        hooks.useNymFamilyMappedDelegations(account)
      );
      const delegations = account.nymResources?.delegations;
      invariant(delegations, "nym: delegations is required");
      expect(
        account.nymResources?.delegations?.some((d) => d.amount[0] === 0)
      ).toBe(false);
      expect(Array.isArray(result.current)).toBe(true);
      expect(result.current.length).toBe(
        (delegations as NymDelegation[]).length
      );
      const { code } = getAccountUnit(account);
      expect(result.current[0].formattedAmount.split(" ")[1]).toBe(code);
      expect(result.current[0].formattedPendingRewards.split(" ")[1]).toBe(
        code
      );
      expect(typeof result.current[0].rank).toBe("number");
      expect(
        (result.current[0].validator as NymValidatorItem).validatorAddress
      ).toBe((delegations as NymDelegation[])[0].validatorAddress);
    });
    describe("mode: claimReward", () => {
      it("should only return delegations which have some pending rewards", async () => {
        const { account, prepare } = setup();
        await prepare();
        const { result } = renderHook(() =>
          hooks.useNymFamilyMappedDelegations(account, "claimReward")
        );
        expect(result.current.length).toBe(3);
      });
    });
  });
  describe("useNymFamilyDelegationsQuerySelector", () => {
    it("should return delegations filtered by query as options", async () => {
      const { account, transaction, prepare } = setup();
      await prepare();
      invariant(
        account.nymResources,
        "nym: account and nym resources required"
      );
      if (!account.nymResources)
        throw new Error("nym: account and nym resources required");

      const delegations = account.nymResources.delegations || [];
      const newTx = {
        ...transaction,
        mode: "delegate",
        validators: delegations.map(({ validatorAddress, amount }) => ({
          address: validatorAddress,
          amount,
        })),
      };
      const { result } = renderHook(() =>
        hooks.useNymFamilyDelegationsQuerySelector(
          account,
          newTx as Transaction
        )
      );
      expect(result.current.options.length).toBe(delegations.length);
      act(() => {
        result.current.setQuery("FRESHNYMS");
      });
      expect(result.current.options.length).toBe(0);
    });
    it("should return the first delegation as value", async () => {
      const { account, transaction, prepare } = setup();
      await prepare();
      invariant(
        account.nymResources,
        "nym: account and nym resources required"
      );
      const delegations =
        (account.nymResources as NymResources).delegations || [];
      const newTx = {
        ...transaction,
        mode: "delegate",
        validators: delegations.map(({ validatorAddress, amount }) => ({
          address: validatorAddress,
          amount,
        })),
      };
      const { result } = renderHook(() =>
        hooks.useNymFamilyDelegationsQuerySelector(
          account,
          newTx as Transaction
        )
      );
      expect(
        (
          (result.current.value as NymMappedDelegation)
            .validator as NymValidatorItem
        ).validatorAddress
      ).toBe(delegations[0].validatorAddress);
    });
    it("should find delegation by sourceValidator field and return as value for redelegate", async () => {
      const { account, transaction, prepare } = setup();
      await prepare();
      invariant(
        account.nymResources,
        "nym: account and nym resources required"
      );
      const delegations =
        (account.nymResources as NymResources).delegations || [];
      const sourceValidator =
        delegations[delegations.length - 1].validatorAddress;
      const newTx = {
        ...transaction,
        mode: "redelegate",
        validators: delegations.map(({ validatorAddress, amount }) => ({
          address: validatorAddress,
          amount,
        })),
        sourceValidator,
      };
      const { result } = renderHook(() =>
        hooks.useNymFamilyDelegationsQuerySelector(
          account,
          newTx as Transaction
        )
      );
      expect(
        (
          (result.current.value as NymMappedDelegation)
            .validator as NymValidatorItem
        ).validatorAddress
      ).toBe(sourceValidator);
    });
  });
  describe("useSortedValidators", () => {
    it("should reutrn sorted validators", async () => {
      const { account, prepare } = setup();
      await prepare();
      const { result: preloadDataResult } = renderHook(() =>
        hooks.useNymFamilyPreloadData("nym")
      );
      const { validators } = preloadDataResult.current;
      const delegations = (account.nymResources?.delegations || []).map(
        ({ validatorAddress, amount }) => ({
          address: validatorAddress,
          amount,
        })
      );
      const { result } = renderHook(() =>
        hooks.useSortedValidators("", validators, delegations)
      );
      expect(result.current.length).toBe(validators.length);
      const { result: searchResult } = renderHook(() =>
        hooks.useSortedValidators("Nodeasy.com", validators, delegations)
      );
      expect(searchResult.current.length).toBe(1);
    });
  });
  describe("reorderValidators", () => {
    it("should return a list of Validators with Ledger first", () => {
      const { result } = renderHook(() =>
        hooks.useLedgerFirstShuffledValidatorsNymFamily("nym")
      );
      expect(result.current[0].validatorAddress).toBe(LEDGER_VALIDATOR_ADDRESS);
    });
  });
});

function setup(): {
  account: NymAccount;
  currencyBridge: CurrencyBridge;
  transaction: Transaction;
  prepare: () => Promise<any>;
} {
  setEnv("MOCK", 1);
  setEnv("EXPERIMENTAL_CURRENCIES", "nym");
  const seed = "nym-2";
  const currency = getCryptoCurrencyById("nym");
  const a = genAccount(seed, {
    currency,
  });
  const account = genAddingOperationsInAccount(a, 3, seed) as NymAccount;
  const currencyBridge = getCurrencyBridge(currency);
  const bridge = getAccountBridge(account);
  const transaction = bridge.createTransaction(account);
  return {
    account,
    currencyBridge,
    transaction,
    prepare: async () => cache.prepareCurrency(currency),
  };
}

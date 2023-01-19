import Nym from "@ledgerhq/hw-app-nym"
import type { Resolver } from "../../hw/getAddress/types"

const resolver: Resolver = async (transport, { path, verify }) => {
  const nym = new Nym(transport)
  const r = await nym.getAddress(path, "nym", verify || false)
  return {
    address: r.address,
    publicKey: r.publicKey,
    path,
  }
}

export default resolver

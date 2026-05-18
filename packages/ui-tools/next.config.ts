import path from 'node:path'
import { withSuzakuNext } from '@suzaku-network/suzaku-sdk/react/config'

export default withSuzakuNext(
  {},
  { workspaceRoot: path.resolve(import.meta.dirname, '..', '..') },
)

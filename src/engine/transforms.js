import { checkRecipeRegexes } from './regexguard.js';
import { checkRecipeHosts } from './hosts.js';
// The only code a recipe can name: a short, versioned list of built-in transforms that ships with the extension.
// A new transform needs an extension release and a new recipe `schema` number (docs/sources/extension-recipes.md section 3).
import { buildState, transactionId } from '../xct.js';

/** Recipe schema numbers this build can run. A recipe with another number is refused, not guessed at. */
export const SUPPORTED_SCHEMAS = [1];
/** Version of the built-in list below (bump with every added or changed transform). */
export const TRANSFORMS_VERSION = 1;

export const TRANSFORMS = {
  // args: home (x.com/home HTML), script (ondemand.s JS), method, path -> the x-client-transaction-id header value.
  async x_transaction_id(args, nowMs) {
    const state = buildState(args.home || '', args.script || '');
    return transactionId(state, args.method || 'GET', args.path || '', nowMs);
  },
};

/** Throws a descriptive Error when this build cannot run the recipe (unknown schema or transform). */
export function checkRecipe(rec) {
  if (!rec || typeof rec !== 'object') throw new Error('no recipe');
  if (!SUPPORTED_SCHEMAS.includes(rec.schema)) throw new Error(`recipe schema ${rec.schema} is newer than this extension supports; update the extension`);
  for (const st of rec.steps || []) {
    if (st.transform && !Object.hasOwn(TRANSFORMS, st.transform.name)) throw new Error(`recipe uses the transform "${st.transform.name}" this extension does not have; update the extension`);
  }
  checkRecipeHosts(rec);
  checkRecipeRegexes(rec);
}

import type { Env } from './_lib/env'
import { indexNowKey } from './_lib/indexnow'
import { withPanelSettings } from './_lib/systemSettings'

/** GET /indexnow-key.txt: the IndexNow ownership proof (contains only the key). 404 until INDEXNOW_KEY is set. */
export const onRequestGet: PagesFunction<Env> = async ({ env: rawEnv }) => {
  const key = indexNowKey(await withPanelSettings(rawEnv))
  return key ? new Response(key, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } }) : new Response('Not found', { status: 404 })
}

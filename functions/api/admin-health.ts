import { healthOf } from '../_lib/adminHealth'
import type { Env } from '../_lib/env'
import { errorResponse, json, requireUser } from '../_lib/http'
import { withPanelSettings } from '../_lib/systemSettings'

/** POST /api/admin-health (admin only): which secrets and settings are present. Only true/false, never a value. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env: rawEnv }) => {
  try {
    await requireUser(request, rawEnv, { admin: true })
    return json(healthOf(await withPanelSettings(rawEnv)))
  } catch (e) { return errorResponse(e) }
}

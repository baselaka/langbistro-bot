/** True on Railway pull-request preview environments (e.g. langbistro-bot-pr-13). */
export function isRailwayPrEnvironment(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const name = [env.RAILWAY_ENVIRONMENT, env.RAILWAY_ENVIRONMENT_NAME]
    .filter(Boolean)
    .join(" ");
  return /(?:^|[\s_-])pr-\d+\b/i.test(name);
}

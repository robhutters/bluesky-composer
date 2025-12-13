export const isBskyLinked = (handle: string, appPassword: string) => {
  return Boolean(handle && appPassword);
};

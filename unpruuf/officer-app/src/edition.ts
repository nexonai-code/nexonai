/** True when this process runs the press edition (safeline Press). Read from the environment so
 *  the lower layers need no extra parameter. */
export function isPressEdition(): boolean {
  return process.env.OFFICER_EDITION === "press";
}

// The lesson studio previously published its fixed $75 rate and ignored old
// ServiceSetting amounts. Do not revive those stale values on upgrade. A price
// deliberately published through the new editor always has a positive revision.
export function publishedServiceSetting(id, setting) {
  return id === 'online' && !(setting?.revision > 0) ? undefined : setting;
}

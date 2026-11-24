import { cache } from "react";
import { createI18n } from "./index";

// This deployment is Traditional Chinese only; the language menu was removed,
// so any locale cookie left in a browser is ignored.
export const getI18n = cache(async () => createI18n("zh-TW"));

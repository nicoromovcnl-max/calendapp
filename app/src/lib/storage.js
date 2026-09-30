export const lsGet = (k) => { try { return localStorage.getItem(k) } catch { return null } }
export const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }
export const lsRemove = (k) => { try { localStorage.removeItem(k) } catch { /* sin almacenamiento */ } }

'use strict';

function compile(pattern) {
  const paramNames = [];
  const regexStr = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

class Router {
  constructor() {
    this.routes = [];
  }
  add(method, pattern, handler) {
    const { regex, paramNames } = compile(pattern);
    this.routes.push({ method, regex, paramNames, handler });
    return this;
  }
  get(pattern, handler) {
    return this.add('GET', pattern, handler);
  }
  post(pattern, handler) {
    return this.add('POST', pattern, handler);
  }
  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(m[i + 1]);
      });
      return { handler: route.handler, params };
    }
    return null;
  }
}

module.exports = { Router };

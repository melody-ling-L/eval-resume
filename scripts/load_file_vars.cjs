const fs = require('fs');
const path = require('path');

function loadFileValue(value) {
  if (typeof value !== 'string' || !value.startsWith('file://')) {
    return value;
  }

  const relativePath = value.slice('file://'.length);
  const absolutePath = path.resolve(__dirname, '..', relativePath);
  return fs.readFileSync(absolutePath, 'utf8');
}

module.exports = function transformVars(vars) {
  return {
    ...vars,
    resume: loadFileValue(vars.resume),
    jd: loadFileValue(vars.jd),
  };
};

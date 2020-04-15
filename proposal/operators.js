const isArray = require("util").isArray;
const isObject = (value) => require("util").isObject(value) && !isArray(value);

const realIndex = (sliceIndex, length) => {
  if (sliceIndex < 0) {
    return Math.max(0, length + sliceIndex);
  }
  return sliceIndex;
};

const childrenIndexOperator = (value, root, [index]) => {
  if (isArray(value)) {
    const realIdx = realIndex(index, value.length);
    if (realIdx >= 0 && realIdx < value.length) {
      return [value[realIdx]];
    }
  }
  return [];
};

const childrenNameOperator = (value, root, [child]) => {
  if (isObject(value) && value[child] !== undefined) {
    return [value[child]];
  }
  return [];
};

const allChildren = (value) => {
  if (isArray(value)) {
    return value;
  } else if (isObject(value)) {
    return Object.values(value);
  }

  return [];
};

const childrenAllOperator = (value) => {
  return allChildren(value);
};

const sliceValueOrDefault = (sliceValue, defaultValue) => {
  if (sliceValue === null) {
    return defaultValue;
  }
  return sliceValue;
};

const range = (start, end, step) => {
  const slice = [];
  if (step > 0) {
    for (let i = start; i < end; i += step) {
      slice.push(i);
    }
  } else {
    for (let i = start; i > end; i += step) {
      slice.push(i);
    }
  }
  return slice;
};

const childrenSliceOperator = (value, root, [start, end, step]) => {
  if (isArray(value)) {
    const stepNumber = sliceValueOrDefault(step, 1);

    const realStart = realIndex(sliceValueOrDefault(start, 0), value.length);
    const realEnd = realIndex(
      sliceValueOrDefault(end, value.length),
      value.length
    );

    return range(realStart, realEnd, stepNumber)
      .filter((i) => 0 <= i && i < value.length)
      .map((i) => value[i]);
  }

  return [];
};

const typeSafeComparison = (comparison) => {
  return (left, right) => {
    if (typeof left !== typeof right) {
      return false;
    }
    return comparison(left, right);
  };
};

const executeScalar = (value, operators) => {
  const results = execute(value, operators);
  if (results.length > 1) {
    throw new Error(
      "Internal error, selector for scalar value returned multiple results"
    );
  }
  return results[0];
};

const filterArgumentOperators = {
  value: (value, root, parameter) => parameter,
  current: (value, root, parameter) => executeScalar(value, parameter),
  root: (value, root, parameter) => executeScalar(root, parameter),
};

const executeFilterArgument = (
  value,
  root,
  [argumentOperatorName, argumentParameters]
) => {
  const argumentOperator = filterArgumentOperators[argumentOperatorName];

  if (!argumentOperator) {
    throw new Error("Internal error, unknown operator");
  }

  return argumentOperator(value, root, argumentParameters);
};

const filterOperators = {
  hasValue: (results) => results !== undefined,
  equals: (left, right) => JSON.stringify(left) === JSON.stringify(right),
  notEquals: (left, right) => JSON.stringify(left) !== JSON.stringify(right),
  lessThan: typeSafeComparison((left, right) => left < right),
  greaterThan: typeSafeComparison((left, right) => left > right),
  lessThanOrEqual: typeSafeComparison((left, right) => left <= right),
  greaterThanOrEqual: typeSafeComparison((left, right) => left >= right),
};

const childrenFilterOperator = (
  value,
  root,
  [[filterOperator, ...argOperators]]
) => {
  const operator = filterOperators[filterOperator];

  if (!operator) {
    throw new Error("Internal error, unknown operator");
  }

  return allChildren(value).filter((v) => {
    const arguments = argOperators.map((argOp) =>
      executeFilterArgument(v, root, argOp)
    );
    return operator(...arguments);
  });
};

const childrenSubOperators = {
  index: childrenIndexOperator,
  name: childrenNameOperator,
  all: childrenAllOperator,
  slice: childrenSliceOperator,
  filter: childrenFilterOperator,
};

const childrenOperator = (value, root, children) => {
  return children.flatMap(([subOperatorName, ...parameters]) => {
    const subOperator = childrenSubOperators[subOperatorName];

    if (!subOperator) {
      throw new Error("Internal error, unknown operator");
    }

    return subOperator(value, root, parameters);
  });
};

const recursiveDescentOperator = (value, root) => {
  if (isArray(value)) {
    return [value].concat(value.flatMap((v) => recursiveDescentOperator(v)));
  } else if (isObject(value)) {
    return [value].concat(
      Object.values(value).flatMap((v) => recursiveDescentOperator(v))
    );
  }
  return [value];
};

const operators = {
  children: childrenOperator,
  recursiveDescent: recursiveDescentOperator,
};

const executeOperator = (value, root, [operatorName, parameter]) => {
  const operator = operators[operatorName];
  if (!operator) {
    throw new Error("Internal error, unknown operator");
  }
  return operator(value, root, parameter);
};

const execute = (root, operators) => {
  return operators.reduce(
    (results, operator) =>
      results.flatMap((current) => executeOperator(current, root, operator)),
    [root]
  );
};

module.exports = execute;

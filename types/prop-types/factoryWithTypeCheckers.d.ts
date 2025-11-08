type Validator = (...args: any[]) => any;

interface TypeCheckerMap {
  [key: string]: Validator;
}

declare function factoryWithTypeCheckers(
  isValidElement: (...args: any[]) => boolean,
  throwOnDirectAccess: boolean
): TypeCheckerMap;

export = factoryWithTypeCheckers;


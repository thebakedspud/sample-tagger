// Minimal PropTypes factory typings to satisfy TypeScript when checking JS sources.
declare module 'prop-types/factoryWithTypeCheckers' {
  type Validator = (...args: any[]) => any;

  interface TypeCheckerMap {
    [key: string]: Validator;
  }

  export default function factoryWithTypeCheckers(
    isValidElement: (...args: any[]) => boolean,
    throwOnDirectAccess: boolean
  ): TypeCheckerMap;
}

declare module 'prop-types/factoryWithTypeCheckers.js' {
  import factory from 'prop-types/factoryWithTypeCheckers';
  export = factory;
}


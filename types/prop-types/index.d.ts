// Minimal PropTypes typings to satisfy TypeScript when checking JS sources.

declare module 'prop-types' {
  type Validator = (...args: any[]) => any

  interface Requireable<T> {
    (props: any, propName: string, componentName: string, location?: string, propFullName?: string): Error | null
    isRequired: Requireable<T>
  }

  interface PrimitiveValidators {
    any: Requireable<any>
    array: Requireable<any[]>
    bool: Requireable<boolean>
    element: Requireable<any>
    func: Requireable<(...args: any[]) => any>
    node: Requireable<any>
    number: Requireable<number>
    object: Requireable<Record<string, any>>
    string: Requireable<string>
  }

  interface PropTypesExports extends PrimitiveValidators {
    arrayOf(type: Validator): Requireable<any[]>
    exact<T>(typeSpec: T): Requireable<T>
    instanceOf(type: any): Requireable<any>
    objectOf(type: Validator): Requireable<Record<string, any>>
    oneOf(values: any[]): Requireable<any>
    oneOfType(types: Validator[]): Requireable<any>
    shape<T>(typeSpec: T): Requireable<T>
  }

  const PropTypes: PropTypesExports

  export type { Validator, Requireable, PropTypesExports }
  export default PropTypes
}

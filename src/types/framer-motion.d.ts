// Minimal module declaration for framer-motion to satisfy TypeScript when types aren't installed.
declare module "framer-motion" {
  import * as React from 'react';
  // Provide a minimal shape for `motion` where common intrinsic elements are components
  type MotionComponent = React.ComponentType<Record<string, unknown>>;
  export const motion: { [K in keyof JSX.IntrinsicElements]: MotionComponent } & { [key: string]: MotionComponent };
  const _default: unknown;
  export default _default;
}

import { createStubPackAdapter } from '../types.ts';

export const sweBenchAdapter = createStubPackAdapter({
  id: 'swe-bench',
  description: 'SWE-bench adapter skeleton.',
  optionalDependency: 'swe-bench',
});

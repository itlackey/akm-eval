import { createStubPackAdapter } from '../types.ts';

export const beamAdapter = createStubPackAdapter({
  id: 'beam',
  description: 'BEAM adapter skeleton.',
  optionalDependency: 'beam',
});

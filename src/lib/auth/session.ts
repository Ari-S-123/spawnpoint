import { cache } from 'react';
import { auth } from './server';

export const getCachedSession = cache(() => auth.getSession());

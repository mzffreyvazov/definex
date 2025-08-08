import React from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsApp } from './OptionsApp';

const container = document.getElementById('root')!;
createRoot(container).render(<OptionsApp />);


export type FullscreenMode='none'|'native'|'page';
export function createReaderFullscreen(surface:HTMLElement,options?:{document?:Document;window?:Window;onChange?:(mode:FullscreenMode)=>void}):{readonly mode:FullscreenMode;toggle():Promise<void>;exit():Promise<void>;close():void};

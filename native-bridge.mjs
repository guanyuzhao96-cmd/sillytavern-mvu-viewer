// Read live ES-module exports, rather than caching a generation event flag.
export function createNativeBridge(script, groups, getContext) {
  return {
    getContext,
    generationState() {
      if (typeof script.isGenerating === 'function') {
        const active = script.isGenerating();
        if (typeof active === 'boolean') return {known:true,active,source:'SillyTavern.isGenerating'};
      }
      if (typeof script.is_send_press === 'boolean' && typeof groups.is_group_generating === 'boolean') {
        return {known:true,active:script.is_send_press||groups.is_group_generating,source:'SillyTavern live exports'};
      }
      return {known:false,active:false,source:'unsupported host exports'};
    },
  };
}

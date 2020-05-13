<script>
import { mapGetters } from 'vuex'
import OpenSite from './TopBar/OpenSite'
export default {
  name: 'TopBar',
  components: { OpenSite },
  computed: {
    ...mapGetters(['sites'])
  }
}
</script>

<template>
  <div
    id="topbar"
    class="flex-row"
  >
    <open-site
      v-for="site in sites"
      :key="'os_'+site.text"
      :text="site.text"
      :url="site.url"
    />
  </div>
</template>

<script>
import { mapGetters } from 'vuex'
import OpenSite from './TopBar/OpenSite'
export default {
  name: 'TopBar',
  components: { OpenSite },
  computed: {
    ...mapGetters(['sites', 'savedTraffic', 'savedTrafficMB']),
    infoTitle () {
      return `loaded ${this.savedTraffic} bytes from cache`
    }
  }
}
</script>

<template>
  <div
    id="topbar"
    class="flex-row"
  >
    <div class="openSites flex-row">
      <open-site
        v-for="site in sites"
        :key="'os_'+site.text"
        :text="site.text"
        :url="site.url"
      />
    </div>
    <div class="topbar-right flex-row">
      <div
        id="topbar-info"
        :title="infoTitle"
      >
        {{ savedTrafficMB }} Mb
      </div>
      <div class="controls">
        <div>Add</div>
      </div>
    </div>
  </div>
</template>

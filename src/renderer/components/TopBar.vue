<script>
import { mapState, mapGetters } from 'vuex'
import OpenSite from './TopBar/OpenSite'
export default {
  name: 'TopBar',
  components: { OpenSite },
  computed: {
    ...mapState(['savedTraffic', 'sites', 'isManga', 'isAddingManga', 'isMangaStored']),
    ...mapGetters(['isSiteViewOpen']),
    infoTitle () {
      let saved = this.savedTraffic
      const line = ['Bytes', 'Kb', 'Mb', 'Gb', 'Tb'].map((name, index) => {
        const prevLevel = Math.pow(1024, index)
        const level = prevLevel * 1024
        const curSaved = saved % level
        if (curSaved) {
          saved -= curSaved
          return `${curSaved / prevLevel} ${name}`
        }
      }).filter(s => s && s.length > 0).reverse().join(' ')
      return `Loaded ${line} from cache`
    },
    savedTrafficMB () {
      return Math.floor(this.savedTraffic / 1024 / 1024)
    },
    isDisabled () {
      return !this.isManga || this.isAddingManga
    },
    isActive () {
      return this.isManga && !this.isMangaStored
    }
  },
  methods: {
    add () {
      if (this.isActive) {
        this.$store.dispatch('MANGA_ADD')
      }
    },
    close () {
      if (this.isSiteViewOpen) {
        this.$store.dispatch('SITE_CLOSE')
      }
    }
  }
}
</script>

<template>
  <div
    id="topbar"
    class="flex-row"
  >
    <div class="flex-row">
      <div
        v-show="isSiteViewOpen"
        class="closeSiteView"
        @click="close"
      >
        X
      </div>
      <div class="openSites flex-row">
        <open-site
          v-for="site in sites"
          :key="'os_'+site.index"
          :text="site.text"
          :pattern="site.pattern"
          :index="site.index"
        />
      </div>
    </div>
    <div class="flex-row">
      <div
        id="topbar-info"
        :title="infoTitle"
      >
        {{ savedTrafficMB }} Mb
      </div>
      <div class="controls">
        <div
          v-show="isActive"
          :class="{active:isActive, disabled: isDisabled}"
          @click="add"
        >
          Add
        </div>
        <div v-if="isMangaStored">
          stored
        </div>
      </div>
    </div>
  </div>
</template>

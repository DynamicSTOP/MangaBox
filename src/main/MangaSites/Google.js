import { MangaSite } from './MangaSite'

class Google extends MangaSite {
  constructor () {
    super()
    this.name = 'Google'
    this.pattern = 'google.com'
    this.indexPage = 'https://www.google.com'
  }
}

export default Google

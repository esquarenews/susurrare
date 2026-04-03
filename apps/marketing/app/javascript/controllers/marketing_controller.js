import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["parallax"]

  connect() {
    this.setupRevealObserver()
    this.boundMouseMove = this.handleMouseMove.bind(this)
    this.boundMouseLeave = this.handleMouseLeave.bind(this)

    if (this.hasParallaxTarget) {
      this.parallaxTarget.addEventListener("mousemove", this.boundMouseMove)
      this.parallaxTarget.addEventListener("mouseleave", this.boundMouseLeave)
    }
  }

  disconnect() {
    this.revealObserver?.disconnect()

    if (this.hasParallaxTarget) {
      this.parallaxTarget.removeEventListener("mousemove", this.boundMouseMove)
      this.parallaxTarget.removeEventListener("mouseleave", this.boundMouseLeave)
    }
  }

  setupRevealObserver() {
    this.revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible")
          this.revealObserver.unobserve(entry.target)
        }
      })
    }, { threshold: 0.18 })

    this.element.querySelectorAll("[data-reveal]").forEach((node) => {
      this.revealObserver.observe(node)
    })
  }

  handleMouseMove(event) {
    const rect = this.parallaxTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5

    this.parallaxTarget.style.setProperty("--parallax-x", `${x * 18}px`)
    this.parallaxTarget.style.setProperty("--parallax-y", `${y * 18}px`)
  }

  handleMouseLeave() {
    this.parallaxTarget.style.setProperty("--parallax-x", "0px")
    this.parallaxTarget.style.setProperty("--parallax-y", "0px")
  }
}

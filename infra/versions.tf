terraform {
  required_version = ">= 1.9"
  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "~> 2.26"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 2.21"
    }
  }
}

provider "vultr" {}        # reads VULTR_API_KEY
provider "mongodbatlas" {} # reads MONGODB_ATLAS_PUBLIC_KEY / MONGODB_ATLAS_PRIVATE_KEY

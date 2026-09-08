variable "environment" {
  description = "Deployment environment name used for resource names and tags."
  type        = string
  default     = "staging"
}

variable "project" {
  description = "Project name used for resource tags."
  type        = string
  default     = "unifolio"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones used by the public, application, and data tiers."
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]

  validation {
    condition     = length(var.availability_zones) == 2
    error_message = "Exactly two availability zones must be supplied."
  }
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs, ordered to match availability_zones."
  type        = list(string)
  default     = ["10.0.0.0/24", "10.0.1.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) == 2
    error_message = "Exactly two public subnet CIDRs must be supplied."
  }
}

variable "private_app_subnet_cidrs" {
  description = "Private application subnet CIDRs, ordered to match availability_zones."
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]

  validation {
    condition     = length(var.private_app_subnet_cidrs) == 2
    error_message = "Exactly two private application subnet CIDRs must be supplied."
  }
}

variable "private_data_subnet_cidrs" {
  description = "Private data subnet CIDRs, ordered to match availability_zones."
  type        = list(string)
  default     = ["10.0.20.0/24", "10.0.21.0/24"]

  validation {
    condition     = length(var.private_data_subnet_cidrs) == 2
    error_message = "Exactly two private data subnet CIDRs must be supplied."
  }
}

variable "fck_nat_instance_type" {
  description = "ARM-based instance type for the staging fck-nat appliance."
  type        = string
  default     = "t4g.nano"
}

variable "bastion_instance_type" {
  description = "ARM-based instance type for the SSM-only bastion."
  type        = string
  default     = "t4g.nano"
}

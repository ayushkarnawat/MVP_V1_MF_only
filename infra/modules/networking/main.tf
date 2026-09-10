locals {
  common_tags = {
    Environment = var.environment
    Project     = var.project
  }

  subnets = {
    public = {
      for index, availability_zone in var.availability_zones : availability_zone => {
        cidr_block              = var.public_subnet_cidrs[index]
        map_public_ip_on_launch = true
      }
    }
    private_app = {
      for index, availability_zone in var.availability_zones : availability_zone => {
        cidr_block              = var.private_app_subnet_cidrs[index]
        map_public_ip_on_launch = false
      }
    }
    private_data = {
      for index, availability_zone in var.availability_zones : availability_zone => {
        cidr_block              = var.private_data_subnet_cidrs[index]
        map_public_ip_on_launch = false
      }
    }
  }
}

data "aws_ami" "fck_nat" {
  most_recent = true
  owners      = ["568608671756"]

  filter {
    name   = "name"
    values = ["fck-nat-al2023-*"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

data "aws_ami" "amazon_linux_2023_arm64" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-kernel-6.1-arm64"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.common_tags, {
    Name = "${var.environment}-vpc"
  })
}

resource "aws_subnet" "public" {
  for_each = local.subnets.public

  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.key
  cidr_block              = each.value.cidr_block
  map_public_ip_on_launch = each.value.map_public_ip_on_launch

  tags = merge(local.common_tags, {
    Name = "${var.environment}-public-${each.key}"
    Tier = "public"
  })
}

resource "aws_subnet" "private_app" {
  for_each = local.subnets.private_app

  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.key
  cidr_block              = each.value.cidr_block
  map_public_ip_on_launch = each.value.map_public_ip_on_launch

  tags = merge(local.common_tags, {
    Name = "${var.environment}-private-app-${each.key}"
    Tier = "private-app"
  })
}

resource "aws_subnet" "private_data" {
  for_each = local.subnets.private_data

  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.key
  cidr_block              = each.value.cidr_block
  map_public_ip_on_launch = each.value.map_public_ip_on_launch

  tags = merge(local.common_tags, {
    Name = "${var.environment}-private-data-${each.key}"
    Tier = "private-data"
  })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-igw"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-public-rt"
  })
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_network_interface" "fck_nat" {
  subnet_id         = aws_subnet.public[var.availability_zones[0]].id
  security_groups   = [aws_security_group.fck_nat.id]
  source_dest_check = false

  tags = merge(local.common_tags, {
    Name = "${var.environment}-fck-nat-eni"
  })
}

# Single-AZ fck-nat is an accepted staging availability trade-off; see readiness report section 12.
resource "aws_instance" "fck_nat" {
  ami           = data.aws_ami.fck_nat.id
  instance_type = var.fck_nat_instance_type

  network_interface {
    network_interface_id = aws_network_interface.fck_nat.id
    device_index         = 0
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  tags = merge(local.common_tags, {
    Name = "${var.environment}-fck-nat"
  })
}

resource "aws_eip" "fck_nat" {
  domain            = "vpc"
  network_interface = aws_network_interface.fck_nat.id

  depends_on = [aws_internet_gateway.this]

  tags = merge(local.common_tags, {
    Name = "${var.environment}-fck-nat-eip"
  })
}

resource "aws_route_table" "private_app" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-private-app-rt"
  })
}

resource "aws_route" "private_app_internet" {
  route_table_id         = aws_route_table.private_app.id
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = aws_network_interface.fck_nat.id

  depends_on = [aws_instance.fck_nat]
}

resource "aws_route_table_association" "private_app" {
  for_each = aws_subnet.private_app

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private_app.id
}

resource "aws_route_table" "private_data" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${var.environment}-private-data-rt"
  })
}

resource "aws_route_table_association" "private_data" {
  for_each = aws_subnet.private_data

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private_data.id
}

data "aws_iam_policy_document" "bastion_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "bastion" {
  name               = "${var.environment}-bastion-role"
  assume_role_policy = data.aws_iam_policy_document.bastion_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${var.environment}-bastion-role"
  })
}

resource "aws_iam_role_policy_attachment" "bastion_ssm" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${var.environment}-bastion-instance-profile"
  role = aws_iam_role.bastion.name

  tags = merge(local.common_tags, {
    Name = "${var.environment}-bastion-instance-profile"
  })
}

resource "aws_instance" "bastion" {
  ami                         = data.aws_ami.amazon_linux_2023_arm64.id
  instance_type               = var.bastion_instance_type
  subnet_id                   = aws_subnet.public[var.availability_zones[0]].id
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  iam_instance_profile        = aws_iam_instance_profile.bastion.name

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  tags = merge(local.common_tags, {
    Name = "${var.environment}-bastion"
  })

  # ami tracks data.aws_ami's most_recent lookup, which resolves to a newer
  # AMI ID every time AWS publishes one — without this, every unrelated
  # `terraform plan` shows a bastion replace. A jump box doesn't need to
  # chase the latest AMI; replace deliberately (untaint this lifecycle rule)
  # if a security-patch refresh is ever actually wanted.
  lifecycle {
    ignore_changes = [ami]
  }
}

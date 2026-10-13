#!/usr/bin/env bash
# Sub-project 2, Task 0: can the scheduled jobs reach every external source? Read-only.
# Runs ONE throwaway Fargate task (same cluster, subnets and security group as the real jobs,
# so it leaves through the fck-nat address) that only makes GET requests and prints a table.
# Needs: AWS CLI logged in to the staging account, staging up (05:00-21:00 IST). Nothing is deployed.
set -euo pipefail
R=ap-south-1; C=unifolio-staging; TD=unifolio-staging-job-nav-daily
NET=$(aws ecs describe-services --cluster $C --services unifolio-staging-backend --region $R \
  --query 'services[0].networkConfiguration.awsvpcConfiguration' --output json)
echo "Network config taken from the backend service:"; echo "$NET"
ARN=$(aws ecs run-task --cluster $C --launch-type FARGATE --task-definition $TD --region $R \
  --network-configuration "{\"awsvpcConfiguration\": $(echo "$NET" | python3 -c 'import json,sys;d=json.load(sys.stdin);d["assignPublicIp"]="DISABLED";print(json.dumps(d))')}" \
  --overrides file://overrides.json --query 'tasks[0].taskArn' --output text)
echo "Started $ARN"; ID=${ARN##*/}
aws ecs wait tasks-stopped --cluster $C --tasks "$ARN" --region $R
echo "Exit code:"; aws ecs describe-tasks --cluster $C --tasks "$ARN" --region $R --query 'tasks[0].containers[0].exitCode'
sleep 10
aws logs get-log-events --log-group-name /ecs/staging-job-nav-daily --log-stream-name "ecs/staging-job-nav-daily/$ID" \
  --region $R --query 'events[].message' --output text | tr '\t' '\n' | tee aws-result.txt
echo; echo "Saved aws-result.txt -- send that file back."

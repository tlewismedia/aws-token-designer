"""AWS Token Designer — Deployment (Python diagrams comparison).

Generate with Docker (no local Graphviz/Python deps needed):
  docker run --rm -v "$PWD":/work -w /work python:3.11-slim \
    bash docs/diagrams/compare/diagrams/render.sh

See docs/diagrams/compare/COMPARISON.md
"""

from diagrams import Cluster, Diagram, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.database import Dynamodb
from diagrams.aws.management import SystemsManagerParameterStore as SSM
from diagrams.aws.management import Cloudwatch
from diagrams.aws.network import APIGateway
from diagrams.aws.network import CloudFront
from diagrams.aws.security import Cognito
from diagrams.aws.storage import S3
from diagrams.aws.integration import SNS
from diagrams.aws.cost import Budgets
from diagrams.aws.general import User
from diagrams.onprem.client import User as ClientUser

GRAPH_ATTR = {
    "fontsize": "16",
    "bgcolor": "white",
    "pad": "0.5",
}

with Diagram(
    "AWS Token Designer - Deployment (diagrams lib, us-west-2)",
    filename="docs/diagrams/compare/diagrams/aws-deployment",
    outformat=["png", "svg"],
    graph_attr=GRAPH_ATTR,
    show=False,
):
    user = User("User")
    spa = ClientUser("React SPA")

    with Cluster("AWS Cloud"):
        with Cluster("Region: us-west-2"):
            cf = CloudFront("CloudFront")
            web = S3("S3 web bucket")
            api = APIGateway("HTTP API")
            api_fn = Lambda("Lambda: api")
            worker = Lambda("Lambda:\ngenerateWorker")
            ddb = Dynamodb("DynamoDB")
            media = S3("S3 media bucket")
            cognito = Cognito("Cognito")
            ssm = SSM("SSM Params")
            cw = Cloudwatch("CloudWatch")
            sns = SNS("SNS")
            budgets = Budgets("Budgets")

    user >> Edge(label="HTTPS") >> spa
    spa >> Edge(label="HTTPS /* + /api/*") >> cf
    cf >> Edge(label="OAC") >> web
    cf >> Edge(label="AllViewer") >> api
    api >> api_fn
    api_fn >> ddb
    api_fn >> media
    api_fn >> ssm
    api_fn >> Edge(style="dashed", label="async") >> worker
    worker >> ddb
    worker >> media
    spa >> Edge(label="auth") >> cognito
    api >> Edge(label="JWT") >> cognito
    spa >> Edge(label="presigned") >> media

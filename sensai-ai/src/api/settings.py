import os
from os.path import join
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv
from functools import lru_cache
from api.config import UPLOAD_FOLDER_NAME
from phoenix.otel import register

root_dir = os.path.dirname(os.path.abspath(__file__))
# Go up two levels to reach the project root: /src/api/ -> /src/ -> /
project_root = join(root_dir, "..", "..")
env_path = join(project_root, ".env.aws")
if os.path.exists(env_path):
    load_dotenv(env_path)


class Settings(BaseSettings):
    google_client_id: str
    google_client_secret: str  # Added this field
    openai_api_key: str
    hf_token: str | None = None  # Hugging Face token for advanced voice processing
    s3_bucket_name: str | None = None  # only relevant when running the code remotely
    s3_folder_name: str | None = None  # only relevant when running the code remotely
    local_upload_folder: str = (
        UPLOAD_FOLDER_NAME  # hardcoded variable for local file storage
    )
    bugsnag_api_key: str | None = None
    env: str | None = None
    slack_user_signup_webhook_url: str | None = None
    slack_course_created_webhook_url: str | None = None
    slack_usage_stats_webhook_url: str | None = None
    phoenix_endpoint: str | None = None
    phoenix_api_key: str | None = None

    model_config = SettingsConfigDict(
        env_file=join(project_root, ".env"), extra="ignore"
    )


@lru_cache
def get_settings():
    return Settings()


settings = get_settings()

if settings.phoenix_api_key is not None:
    os.environ["PHOENIX_API_KEY"] = settings.phoenix_api_key

if settings.hf_token is not None:
    os.environ["HF_TOKEN"] = settings.hf_token

tracer_provider = register(
    protocol="http/protobuf",
    project_name=f"sensai-{settings.env}",
    auto_instrument=True,
    batch=True,
    endpoint=(
        f"{settings.phoenix_endpoint}/v1/traces" if settings.phoenix_endpoint else None
    ),
)
tracer = tracer_provider.get_tracer(__name__)

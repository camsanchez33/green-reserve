-- CreateIndex
CREATE UNIQUE INDEX "AgreementAcceptance_courseId_document_version_key" ON "AgreementAcceptance"("courseId", "document", "version");


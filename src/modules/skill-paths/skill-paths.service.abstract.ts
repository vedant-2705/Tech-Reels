/**
 * @module modules/skill-paths/skill-paths.service.abstract
 * @description
 * Abstract class contract for the skill-paths application service.
 *
 * Controllers depend on this abstract class rather than the concrete
 * implementation.  DI is wired in SkillPathsModule so `SkillPathsService`
 * (token) resolves to `SkillPathsServiceImpl` (concrete class).
 */

import { CreatePathDto } from "./dto/create-path.dto";
import { UpdatePathDto } from "./dto/update-path.dto";
import { PathQueryDto } from "./dto/path-query.dto";

import { PathResponseDto } from "./dto/path-response.dto";
import { PathListResponseDto } from "./dto/path-list-response.dto";
import { PathDetailResponseDto } from "./dto/path-detail-response.dto";
import { EnrolResponseDto } from "./dto/enrol-response.dto";
import { PathProgressResponseDto } from "./dto/path-progress-response.dto";
import { EnrolledPathsResponseDto } from "./dto/enrolled-paths-response.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

export abstract class SkillPathsService {
    /** Return published skill paths, optionally filtered by difficulty (paginated). 
     * 
     * @param userId UUID of the requesting user.
     * @param query  Difficulty filter, cursor, and limit.
     * @returns Paginated path list with enrolment status.
     */
    abstract getPaths(
        userId: string,
        query: PathQueryDto,
    ): Promise<PathListResponseDto>;

    /** Return all paths the user is enrolled in or has completed. 
     * 
     * @param userId UUID of the requesting user.
     * @returns All enrolled paths with status and progress.
     */
    abstract getEnrolled(userId: string): Promise<EnrolledPathsResponseDto>;

    /** Return a single published skill path with reel list and enrolment data.
     * 
     * @param userId  UUID of the requesting user.
     * @param pathId  Skill path UUID.
     * @returns Full path detail with reel list and completion flags.
     * @throws PathNotFoundException if path does not exist or is unpublished.
     */
    abstract getPathById(
        userId: string,
        pathId: string,
    ): Promise<PathDetailResponseDto>;

    /** Enrol the user in a skill path.
     * 
     * @param userId  UUID of the user enrolling.
     * @param pathId  Skill path UUID.
     * @returns Enrolment confirmation with path_id and enrolled_at.
     * @throws PathNotFoundException    if path does not exist or is unpublished.
     * @throws AlreadyEnrolledException if user is already in_progress.
     */
    abstract enrol(
        userId: string,
        pathId: string,
    ): Promise<EnrolResponseDto>;

    /** Unenrol the user from a skill path.
     * 
     * @param userId  UUID of the user unenrolling.
     * @param pathId  Skill path UUID.
     * @returns Success message.
     * @throws PathNotFoundException if path does not exist (deleted).
     * @throws NotEnrolledException  if user is not enrolled.
     */
    abstract unenrol(
        userId: string,
        pathId: string,
    ): Promise<MessageResponseDto>;

    /** Return the user's progress through a skill path.
     * 
     * @param userId  UUID of the requesting user.
     * @param pathId  Skill path UUID.
     * @returns Detailed progress state including next_reel and certificate_url.
     * @throws PathNotFoundException if path does not exist or is unpublished.
     * @throws NotEnrolledException  if user is not enrolled (not PathNotFoundException).
     */
    abstract getProgress(
        userId: string,
        pathId: string,
    ): Promise<PathProgressResponseDto>;

    /** Admin: create a new skill path.
     * 
     * @param adminId UUID of the admin creating the path.
     * @param dto     Validated creation payload.
     * @returns Minimal PathResponseDto with created_at.
     * @throws InvalidPathReelsException if any reel ID is invalid or not active.
     */
    abstract createPath(
        adminId: string,
        dto: CreatePathDto,
    ): Promise<PathResponseDto>;

    /** Admin: update a skill path's metadata and/or reel list.
     * 
     * @param adminId  UUID of the admin performing the update.
     * @param pathId   Skill path UUID.
     * @param dto      Partial update payload.
     * @returns Updated PathResponseDto with updated_at.
     * @throws PathNotFoundException     if path does not exist or is deleted.
     * @throws InvalidPathReelsException if any reel ID is invalid or not active.
     */
    abstract updatePath(
        adminId: string,
        pathId: string,
        dto: UpdatePathDto,
    ): Promise<PathResponseDto>;

    /** Admin: soft-delete a skill path.
     * 
     * @param adminId  UUID of the admin performing the deletion.
     * @param pathId   Skill path UUID.
     * @returns Success message.
     * @throws PathNotFoundException if path does not exist or is already deleted.
     */
    abstract deletePath(
        adminId: string,
        pathId: string,
    ): Promise<MessageResponseDto>;
}
